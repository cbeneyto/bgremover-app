/**
 * Single place where the renderer's `window.api.*` is wired up. Every
 * handler here corresponds 1:1 to a method on the `RendererApi`
 * interface in `shared/protocol.ts`.
 *
 * The contract is intentionally narrow: the renderer can pick paths,
 * inspect spreadsheets, and start/cancel batches — nothing else. No
 * raw `fs` or `child_process` is exposed.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from "electron"
import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join } from "node:path"

import type {
  EdgeMode,
  JobInput,
  JobState,
  ModelStatus,
  WorkerOutbound,
} from "../shared/protocol"
import {
  downloadSpreadsheetToTemp,
  extractColumnUrls,
  readSpreadsheetMeta,
} from "./input-resolver"
import {
  clearModelCache as clearModelCacheNow,
  getLocalModelRevision,
  getModelCacheBytes,
  getModelDir,
  getModelStatus,
  markDownloadStarting,
  onModelStatus,
  refreshModelStatus,
} from "./model-manager"
import { restartWorker, send, workerIsRunning } from "./worker-bridge"

const RASTER_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
])

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

// Map worker job ids → renderer-facing label/output for status events.
// We hold onto the input and output paths so the done-modal can show
// a real before/after preview from the most recent batch.
const activeJobs = new Map<
  string,
  {
    label: string
    outputName: string
    kind: "file" | "url"
    inputPath?: string
    outputPath: string
    startedAt: number
  }
>()
let batchTotal = 0
let batchDone = 0
let batchFailed = 0

export function registerIpcHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle("pick-folder", async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory", "createDirectory"],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle("pick-save-folder", async () => {
    const win = getWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: "Choose output folder",
      properties: ["openDirectory", "createDirectory"],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(
    "pick-file",
    async (
      _evt,
      filters?: { name: string; extensions: string[] }[],
    ) => {
      const win = getWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: filters ?? [
          { name: "Spreadsheets", extensions: ["xlsx", "csv", "tsv"] },
        ],
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0]
    },
  )

  ipcMain.handle("list-folder-images", async (_evt, dir: string) => {
    const entries = await readdir(dir)
    const filtered: string[] = []
    for (const name of entries) {
      const full = join(dir, name)
      try {
        const s = await stat(full)
        if (!s.isFile()) continue
      } catch {
        continue
      }
      if (RASTER_EXTS.has(extname(name).toLowerCase())) {
        filtered.push(full)
      }
    }
    filtered.sort()
    return filtered
  })

  ipcMain.handle("read-spreadsheet-local", async (_evt, filePath: string) => {
    return await readSpreadsheetMeta(filePath)
  })

  ipcMain.handle("read-spreadsheet-url", async (_evt, url: string) => {
    const path = await downloadSpreadsheetToTemp(url)
    return await readSpreadsheetMeta(path)
  })

  ipcMain.handle(
    "extract-column-urls",
    async (
      _evt,
      args: { filePath: string; sheetName: string; columnLetter: string },
    ) => extractColumnUrls(args),
  )

  ipcMain.handle("get-model-status", async (): Promise<ModelStatus> => {
    return getModelStatus()
  })

  ipcMain.handle("download-model", async (): Promise<void> => {
    // Tell the worker to start (or no-op if already warmed up), and
    // mark the status as downloading so the banner shows the bar
    // immediately. The worker's progress_callback drives the actual
    // byte counts within ~1 s as transformers.js opens the
    // connection to Hugging Face.
    send({ type: "warm-up" })
    markDownloadStarting()
  })

  ipcMain.handle("clear-model-cache", async () => {
    // Stop the worker first so it isn't holding file handles, then
    // wipe the cache. The bridge respawns on the next batch / warm-up.
    restartWorker()
    const result = clearModelCacheNow()
    refreshModelStatus()
    return result
  })

  ipcMain.handle("open-model-cache-folder", async () => {
    const dir = getModelDir()
    await shell.openPath(dir)
  })

  ipcMain.handle("set-edge-mode", async (_evt, mode: EdgeMode) => {
    send({ type: "set-config", edgeMode: mode })
  })

  ipcMain.handle("check-model-updates", async () => {
    return await checkModelUpdates()
  })

  ipcMain.handle("get-app-info", async () => {
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? "unknown",
      nodeVersion: process.versions.node ?? "unknown",
      platform: process.platform,
      modelCacheBytes: getModelCacheBytes(),
      modelCacheDir: getModelDir(),
    }
  })

  ipcMain.handle("get-platform", async () => {
    return process.platform
  })

  ipcMain.handle("open-path", async (_evt, path: string) => {
    await shell.openPath(path)
  })

  ipcMain.handle("read-image-as-data-url", async (_evt, path: string) => {
    const buf = await readFile(path)
    const ext = extname(path).toLowerCase()
    const mime = IMAGE_MIME_BY_EXT[ext] ?? "image/png"
    return `data:${mime};base64,${buf.toString("base64")}`
  })

  ipcMain.handle(
    "start-batch",
    async (_evt, args: { jobs: JobInput[] }) => {
      if (!workerIsRunning()) {
        return { ok: false as const, error: "Worker not running" }
      }
      // If the user kicks off a batch before clicking "Download
      // model", the worker will trigger warm-up implicitly when it
      // sees the first job — make sure the banner reflects that.
      if (getModelStatus().state !== "ready") {
        markDownloadStarting()
      }
      activeJobs.clear()
      batchTotal = args.jobs.length
      batchDone = 0
      batchFailed = 0
      emitSummary(getWindow())
      for (const job of args.jobs) {
        activeJobs.set(job.id, {
          label: job.label,
          outputName: basename(job.output),
          kind: job.kind,
          inputPath: job.kind === "file" ? job.input : undefined,
          outputPath: job.output,
          startedAt: 0,
        })
        // Emit a pending state up-front so the UI shows the queue.
        sendJobState(getWindow(), {
          id: job.id,
          kind: job.kind,
          label: job.label,
          outputName: basename(job.output),
          status: "pending",
        })
        if (job.kind === "file" && job.input) {
          send({
            type: "job",
            id: job.id,
            kind: "file",
            input: job.input,
            output: job.output,
          })
        } else if (job.kind === "url" && job.url) {
          send({
            type: "job",
            id: job.id,
            kind: "url",
            url: job.url,
            output: job.output,
          })
        }
      }
      return { ok: true as const }
    },
  )

  ipcMain.handle("cancel-batch", async () => {
    // Cheapest correct cancellation: shut the worker down. The bridge
    // will respawn it on the next batch. Half-in-flight jobs end with
    // a status of "cancelled".
    for (const [id, info] of activeJobs) {
      const win = getWindow()
      sendJobState(win, {
        id,
        kind: info.kind,
        label: info.label,
        outputName: info.outputName,
        status: "cancelled",
      })
    }
    activeJobs.clear()
    // Tell worker to stop in-flight job; respawn happens on next batch.
    // For MVP simplicity we send a soft "shutdown" — the worker will
    // exit and main lifecycle will respawn it lazily on the next job.
    send({ type: "shutdown" })
  })

  // Pipe worker events into the renderer once a window exists.
  ipcMain.on("worker-event-test", () => {
    /* unused; events flow through `worker:event` channel set up in main/index.ts */
  })

  // Bridge model status changes to renderer.
  onModelStatus((status) => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    win.webContents.send("model:status", status)
  })
}

/** Translate a worker event into renderer-friendly state. */
export function handleWorkerEvent(
  win: BrowserWindow | null,
  event: WorkerOutbound,
): void {
  if (!win || win.isDestroyed()) return
  if (event.type === "progress") {
    const info = activeJobs.get(event.id)
    if (!info) return
    if (event.phase === "downloading" && info.startedAt === 0) {
      info.startedAt = Date.now()
    } else if (event.phase === "inferring" && info.startedAt === 0) {
      info.startedAt = Date.now()
    }
    sendJobState(win, {
      id: event.id,
      kind: info.kind,
      label: info.label,
      outputName: info.outputName,
      status: "running",
      phase: event.phase,
    })
    return
  }
  if (event.type === "done") {
    const info = activeJobs.get(event.id)
    if (!info) return
    batchDone++
    activeJobs.delete(event.id)
    sendJobState(win, {
      id: event.id,
      kind: info.kind,
      label: info.label,
      outputName: basename(event.outputPath),
      status: "done",
      ms: event.ms,
      // File-mode jobs already know their input path; URL-mode jobs
      // get one from the worker's temp stash (see worker/temp-source.ts).
      inputPath: info.inputPath ?? event.sourcePath,
      outputPath: event.outputPath,
    })
    emitSummary(win)
    return
  }
  if (event.type === "error") {
    const info = activeJobs.get(event.id)
    if (!info) return
    batchFailed++
    activeJobs.delete(event.id)
    sendJobState(win, {
      id: event.id,
      kind: info.kind,
      label: info.label,
      outputName: info.outputName,
      status: "error",
      error: event.message,
    })
    emitSummary(win)
    return
  }
  if (event.type === "log") {
    win.webContents.send("worker:log", event)
    return
  }
}

function sendJobState(
  win: BrowserWindow | null,
  state: JobState,
): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send("job:state", state)
}

function emitSummary(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return
  win.webContents.send("batch:summary", {
    total: batchTotal,
    done: batchDone,
    failed: batchFailed,
  })
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"))
  return i >= 0 ? p.slice(i + 1) : p
}

const MODEL_REPO = "briaai/RMBG-1.4"

/**
 * Ask Hugging Face for the latest revision SHA of the model repo and
 * compare it against the one cached on disk. We deliberately don't
 * subscribe to general-purpose update RSS / news — we only check the
 * one repo we depend on.
 *
 * Fails closed: any network error returns `upToDate: true` with a null
 * remote revision so the UI doesn't nag offline users.
 */
async function checkModelUpdates(): Promise<{
  repo: string
  localRevision: string | null
  remoteRevision: string | null
  upToDate: boolean
}> {
  const localRevision = getLocalModelRevision()
  let remoteRevision: string | null = null
  try {
    const res = await fetch(
      `https://huggingface.co/api/models/${MODEL_REPO}/revision/main`,
      { headers: { Accept: "application/json" } },
    )
    if (res.ok) {
      const body = (await res.json()) as { sha?: string }
      remoteRevision = body.sha ?? null
    }
  } catch {
    remoteRevision = null
  }
  const upToDate =
    remoteRevision == null || localRevision == null
      ? true
      : localRevision === remoteRevision
  return { repo: MODEL_REPO, localRevision, remoteRevision, upToDate }
}
