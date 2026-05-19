/**
 * Worker entry point. Reads JSONL messages from stdin, writes JSONL
 * messages to stdout, and processes one job at a time.
 *
 * The protocol is the discriminated union in `shared/protocol.ts`.
 * stdout is reserved for protocol messages — anything else (logs,
 * progress noise from transformers/onnxruntime) goes to stderr to
 * keep the channel clean.
 *
 * One worker = one persistent model load. Spawn-per-job would pay
 * the ~15s warm-up on every image and is unusable.
 */

import { readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { dirname, extname } from "node:path"
import readline from "node:readline"

import type {
  EdgeMode,
  WorkerInbound,
  WorkerOutbound,
} from "../shared/protocol"
import { DEFAULT_EDGE_MODE } from "../shared/protocol"
import {
  removeBackground,
  setCacheDir,
  setDownloadProgressHook,
  warmUp,
} from "./background-removal"
import { fetchImage } from "./fetch-image"
import { saveSourceForPreview } from "./temp-source"

// Forward `@huggingface/transformers` download progress to main as
// JSONL `model-download` events. Main turns them into model:status
// updates that the renderer's banner reads. Without this hook the
// download is silent and the banner's bar stays at 0 %.
setDownloadProgressHook((downloaded, total) => {
  emit({ type: "model-download", downloaded, total })
})

// Worker-level config. Mutable, updated by `set-config` messages.
let currentEdgeMode: EdgeMode = DEFAULT_EDGE_MODE

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

function emit(msg: WorkerOutbound): void {
  process.stdout.write(JSON.stringify(msg) + "\n")
}

function log(level: "info" | "warn" | "error", message: string): void {
  emit({ type: "log", level, message })
  process.stderr.write(`[${level}] ${message}\n`)
}

async function ensureParent(file: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
}

async function processFileJob(
  id: string,
  input: string,
  output: string,
): Promise<void> {
  const t0 = Date.now()
  emit({ type: "progress", id, phase: "loading" })
  const buf = await readFile(input)
  const ext = extname(input).toLowerCase()
  const mime = MIME_BY_EXT[ext] ?? "image/jpeg"
  emit({ type: "progress", id, phase: "inferring" })
  const pngBuffer = await removeBackground(buf, mime, currentEdgeMode)
  emit({ type: "progress", id, phase: "writing" })
  await ensureParent(output)
  await writeFile(output, pngBuffer)
  emit({ type: "done", id, outputPath: output, ms: Date.now() - t0 })
}

async function processUrlJob(
  id: string,
  url: string,
  output: string,
): Promise<void> {
  const t0 = Date.now()
  emit({ type: "progress", id, phase: "downloading" })
  const { buffer, mimeType } = await fetchImage(url)
  // Stash a copy of the source bytes so the done-modal can show a
  // real before/after for URL jobs. The save is fire-and-forget
  // relative to inference — we DO await it so the path we report
  // exists when main reads it, but inference doesn't wait.
  const sourcePath = await saveSourceForPreview(id, buffer, mimeType)
  emit({ type: "progress", id, phase: "inferring" })
  const pngBuffer = await removeBackground(buffer, mimeType, currentEdgeMode)
  emit({ type: "progress", id, phase: "writing" })
  await ensureParent(output)
  await writeFile(output, pngBuffer)
  emit({
    type: "done",
    id,
    outputPath: output,
    ms: Date.now() - t0,
    sourcePath,
  })
}

async function handleJob(msg: Extract<WorkerInbound, { type: "job" }>) {
  try {
    if (msg.kind === "file") {
      // Sanity-check the file exists with a friendly error before
      // letting sharp die on a missing path.
      await stat(msg.input)
      await processFileJob(msg.id, msg.input, msg.output)
    } else {
      await processUrlJob(msg.id, msg.url, msg.output)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit({ type: "error", id: msg.id, message })
  }
}

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  })

  // Warm-up is **lazy**: we no longer kick it off on boot. The main
  // process decides when — either by sending an explicit `warm-up`
  // message (user clicked "Download model") or implicitly when the
  // first `job` arrives. Calling warmUp() multiple times is cheap
  // because the cached getters short-circuit after the first run.
  let warmingUp = false
  const triggerWarmUp = (): void => {
    if (warmingUp) return
    warmingUp = true
    warmUp()
      .then(() => emit({ type: "ready" }))
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        emit({ type: "error", id: "warm-up", message })
        log("error", `model warm-up failed: ${message}`)
      })
  }

  // Serialize jobs through a queue. Parallelism on a single CPU
  // doesn't help — onnxruntime is already multithreaded internally.
  const queue: Extract<WorkerInbound, { type: "job" }>[] = []
  let busy = false
  const pump = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      while (queue.length > 0) {
        const job = queue.shift()!
        await handleJob(job)
      }
    } finally {
      busy = false
    }
  }

  rl.on("line", (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg: WorkerInbound
    try {
      msg = JSON.parse(trimmed) as WorkerInbound
    } catch (err) {
      log("error", `bad inbound JSON: ${trimmed}`)
      return
    }
    switch (msg.type) {
      case "init":
        // Point transformers.js at the directory we got from main.
        // The Python HF env vars (HF_HOME, TRANSFORMERS_CACHE) are
        // already set on us by the parent but transformers.js
        // doesn't read them — `env.cacheDir` is the JS-side knob.
        setCacheDir(msg.modelDir)
        return
      case "warm-up":
        triggerWarmUp()
        return
      case "set-config":
        currentEdgeMode = msg.edgeMode
        log("info", `edge mode set to ${msg.edgeMode}`)
        return
      case "job":
        // Receiving a job also implies "we need the model" — kick off
        // warm-up if it hasn't been triggered explicitly yet. The job
        // will await the model internally inside removeBackground().
        triggerWarmUp()
        queue.push(msg)
        void pump()
        return
      case "cancel":
        // For MVP we don't preempt mid-inference. The main process
        // sends shutdown for hard-cancel; cancel is a no-op for now
        // unless the job hasn't started.
        {
          const before = queue.length
          const idx = queue.findIndex((j) => j.id === msg.id)
          if (idx >= 0) {
            queue.splice(idx, 1)
            emit({ type: "error", id: msg.id, message: "cancelled" })
          }
          log("info", `cancel id=${msg.id} queued=${before}`)
        }
        return
      case "shutdown":
        log("info", "shutdown requested")
        process.exit(0)
    }
  })

  rl.on("close", () => {
    process.exit(0)
  })
}

void main()
