/**
 * Preload script. Runs in an isolated context attached to the
 * renderer; the only thing the renderer ever sees is `window.api`.
 *
 * Each method is a thin wrapper around `ipcRenderer.invoke` (for
 * request/response) or `ipcRenderer.on` (for streamed events).
 *
 * `platform` is exposed synchronously (not via IPC) because the
 * renderer needs it on first paint to reserve room for the macOS
 * traffic-light buttons under `titleBarStyle: "hiddenInset"`.
 */

import { contextBridge, ipcRenderer } from "electron"

import type {
  BatchSummary,
  JobInput,
  JobState,
  ModelStatus,
  RendererApi,
  SpreadsheetMeta,
} from "../shared/protocol"

const api: RendererApi = {
  platform: process.platform,

  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  pickFile: (filters) => ipcRenderer.invoke("pick-file", filters),
  pickSaveFolder: () => ipcRenderer.invoke("pick-save-folder"),

  listFolderImages: (dir) => ipcRenderer.invoke("list-folder-images", dir),

  readSpreadsheetLocal: (filePath) =>
    ipcRenderer.invoke("read-spreadsheet-local", filePath) as Promise<SpreadsheetMeta>,
  readSpreadsheetUrl: (url) =>
    ipcRenderer.invoke("read-spreadsheet-url", url) as Promise<SpreadsheetMeta>,
  extractColumnUrls: (args) => ipcRenderer.invoke("extract-column-urls", args),

  startBatch: (args: { jobs: JobInput[] }) =>
    ipcRenderer.invoke("start-batch", args),
  cancelBatch: () => ipcRenderer.invoke("cancel-batch"),

  getModelStatus: () =>
    ipcRenderer.invoke("get-model-status") as Promise<ModelStatus>,
  downloadModel: () => ipcRenderer.invoke("download-model"),
  clearModelCache: () =>
    ipcRenderer.invoke("clear-model-cache") as Promise<{ freedBytes: number }>,
  openModelCacheFolder: () => ipcRenderer.invoke("open-model-cache-folder"),
  setEdgeMode: (mode) => ipcRenderer.invoke("set-edge-mode", mode),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  readImageAsDataUrl: (path) =>
    ipcRenderer.invoke("read-image-as-data-url", path) as Promise<string>,
  checkModelUpdates: () =>
    ipcRenderer.invoke("check-model-updates") as ReturnType<
      RendererApi["checkModelUpdates"]
    >,
  getAppInfo: () =>
    ipcRenderer.invoke("get-app-info") as ReturnType<
      RendererApi["getAppInfo"]
    >,

  onJobUpdate: (cb) => {
    const handler = (_evt: unknown, state: JobState) => cb(state)
    ipcRenderer.on("job:state", handler)
    return () => ipcRenderer.removeListener("job:state", handler)
  },
  onBatchSummary: (cb) => {
    const handler = (_evt: unknown, summary: BatchSummary) => cb(summary)
    ipcRenderer.on("batch:summary", handler)
    return () => ipcRenderer.removeListener("batch:summary", handler)
  },
  onModelStatus: (cb) => {
    const handler = (_evt: unknown, status: ModelStatus) => cb(status)
    ipcRenderer.on("model:status", handler)
    return () => ipcRenderer.removeListener("model:status", handler)
  },
}

contextBridge.exposeInMainWorld("api", api)
