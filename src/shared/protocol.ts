/**
 * Discriminated unions for the worker protocol (JSONL over stdio)
 * and the renderer ↔ main IPC.
 *
 * Keep this file dependency-free so it can be imported from main,
 * preload, renderer, and worker without circular-dep risk.
 */

// ── Worker JSONL protocol ──────────────────────────────────────────

/** Mask post-processing modes — see src/worker/mask-postprocess.ts. */
export type EdgeMode = "soft" | "balanced" | "crisp"

export const DEFAULT_EDGE_MODE: EdgeMode = "soft"

export type WorkerInbound =
  | { type: "init"; modelDir: string }
  | { type: "warm-up" }
  | { type: "set-config"; edgeMode: EdgeMode }
  | {
      type: "job"
      id: string
      kind: "file"
      input: string
      output: string
    }
  | {
      type: "job"
      id: string
      kind: "url"
      url: string
      output: string
    }
  | { type: "cancel"; id: string }
  | { type: "shutdown" }

export type JobPhase =
  | "queued"
  | "downloading"
  | "loading"
  | "inferring"
  | "writing"

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "progress"; id: string; phase: JobPhase; bytes?: number }
  | {
      type: "done"
      id: string
      outputPath: string
      ms: number
      /** For URL-kind jobs the worker stashes the downloaded source
       *  to a temp file; this is its absolute path. Undefined for
       *  file-kind jobs (main already knows their input path). */
      sourcePath?: string
    }
  | { type: "error"; id: string; message: string }
  | {
      type: "model-download"
      downloaded: number
      total: number
    }
  | { type: "log"; level: "info" | "warn" | "error"; message: string }

// ── Job model (renderer-facing) ────────────────────────────────────

export type JobKind = "file" | "url"

export interface JobInput {
  id: string
  kind: JobKind
  label: string
  /** for file jobs */
  input?: string
  /** for url jobs */
  url?: string
  output: string
}

export type JobStatus =
  | "pending"
  | "running"
  | "done"
  | "error"
  | "cancelled"

export interface JobState {
  id: string
  kind: JobKind
  label: string
  outputName: string
  status: JobStatus
  phase?: JobPhase
  ms?: number
  error?: string
  /** Absolute path of the source. Only set for file-kind jobs —
   *  URL-kind jobs have no local input. Used by the done-modal to
   *  show a real before/after preview. */
  inputPath?: string
  /** Absolute path of the produced PNG. Set on `done`. */
  outputPath?: string
}

// ── Renderer IPC API ───────────────────────────────────────────────

export type InputMode = "folder" | "spreadsheet-local" | "spreadsheet-url"

export interface SpreadsheetMeta {
  filePath: string
  sheets: string[]
  headersBySheet: Record<string, { letter: string; header: string }[]>
}

export interface ModelStatus {
  state: "checking" | "missing" | "downloading" | "ready" | "error"
  downloaded?: number
  total?: number
  error?: string
}

export interface BatchSummary {
  total: number
  done: number
  failed: number
}

/** Shape of what `contextBridge` exposes as `window.api`. */
export interface RendererApi {
  /** Platform string from the main process, e.g. "darwin", "win32".
   *  Used by the renderer to reserve space for the macOS traffic-light
   *  buttons when titleBarStyle = "hiddenInset". */
  platform: NodeJS.Platform

  pickFolder(): Promise<string | null>
  pickFile(
    filters?: { name: string; extensions: string[] }[],
  ): Promise<string | null>
  pickSaveFolder(): Promise<string | null>

  listFolderImages(dir: string): Promise<string[]>

  readSpreadsheetLocal(filePath: string): Promise<SpreadsheetMeta>
  readSpreadsheetUrl(url: string): Promise<SpreadsheetMeta>
  extractColumnUrls(args: {
    filePath: string
    sheetName: string
    columnLetter: string
  }): Promise<string[]>

  startBatch(args: {
    jobs: JobInput[]
  }): Promise<{ ok: true } | { ok: false; error: string }>
  cancelBatch(): Promise<void>

  getModelStatus(): Promise<ModelStatus>
  /** Kick off the model download (warm-up). Safe to call repeatedly —
   *  the worker only downloads once. */
  downloadModel(): Promise<void>
  /** Delete the cached model directory. Returns the bytes freed. */
  clearModelCache(): Promise<{ freedBytes: number }>
  /** Open the model cache directory in the OS file browser. */
  openModelCacheFolder(): Promise<void>
  /** Push the user's edge-mode preference to the worker. */
  setEdgeMode(mode: EdgeMode): Promise<void>
  /** Latest revision of the model repo on Hugging Face. */
  checkModelUpdates(): Promise<{
    repo: string
    localRevision: string | null
    remoteRevision: string | null
    upToDate: boolean
  }>
  /** Open a folder (or file) in the OS file browser. */
  openPath(path: string): Promise<void>
  /** Read a local image file and return it as a `data:` URL. Used
   *  by the done-modal's before/after preview — the renderer can't
   *  load file:// URLs under the current sandbox settings, so we
   *  inline the bytes. Cheap for the one-off preview, would be
   *  silly for batch use. */
  readImageAsDataUrl(path: string): Promise<string>
  /** App-level facts used in the About panel. */
  getAppInfo(): Promise<{
    appVersion: string
    electronVersion: string
    nodeVersion: string
    platform: NodeJS.Platform
    modelCacheBytes: number
    modelCacheDir: string
  }>

  onJobUpdate(cb: (state: JobState) => void): () => void
  onBatchSummary(cb: (summary: BatchSummary) => void): () => void
  onModelStatus(cb: (status: ModelStatus) => void): () => void
}

declare global {
  interface Window {
    api: RendererApi
  }
}
