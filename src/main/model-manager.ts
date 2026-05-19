/**
 * Decides where RMBG-1.4 weights live on disk and watches that
 * directory so the renderer can show a "downloading model" banner.
 *
 * The actual download is triggered by `@huggingface/transformers`
 * inside the worker on its first inference call — we just set the
 * env vars (`HF_HOME` / `TRANSFORMERS_CACHE`) before spawn so the
 * library targets our cache dir instead of `~/.cache/huggingface/`.
 *
 * We don't trust file presence alone: a half-downloaded model would
 * pass an existsSync. Instead we look for the `.onnx` weight file at
 * the expected path and check it's larger than a sane minimum (the
 * full RMBG-1.4 ONNX is ~180 MB; anything below 10 MB is suspect).
 */

import { app } from "electron"
import {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  mkdirSync,
} from "node:fs"
import { join } from "node:path"

import type { ModelStatus } from "../shared/protocol"

/**
 * Subpath used by `@huggingface/transformers` under `env.cacheDir`
 * for the RMBG-1.4 repo. The JS port writes files at
 * `<cacheDir>/<org>/<repo>/<file>` — NOT the Python HF Hub layout
 * (`models--<org>--<repo>/snapshots/<sha>/...`). We learned this
 * the hard way by finding a 168 MB onnx file inside
 * `node_modules/@huggingface/transformers/.cache/briaai/RMBG-1.4/`
 * while the app insisted the model wasn't downloaded.
 */
const MODEL_REPO_DIR = join("briaai", "RMBG-1.4")
/**
 * Sanity floor for "is the model present?". The real .onnx is
 * ~168 MB; 100 MB is comfortably above any partial / metadata-only
 * state and well below the smallest valid download. Used at boot
 * time only — during a live download the worker's progress events
 * drive the UI, not this check.
 */
const READY_THRESHOLD_BYTES = 100 * 1024 * 1024
const EXPECTED_TOTAL_BYTES = 180 * 1024 * 1024 // RMBG-1.4 onnx is ~176 MB

let modelDirCache: string | null = null
let currentStatus: ModelStatus = { state: "checking" }
const listeners = new Set<(s: ModelStatus) => void>()

export function getModelDir(): string {
  if (modelDirCache) return modelDirCache
  modelDirCache = join(app.getPath("userData"), "models")
  return modelDirCache
}

export async function ensureModelDir(): Promise<void> {
  const dir = getModelDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Point @huggingface/transformers at our cache for any process we
  // spawn that inherits this env (the worker).
  process.env["HF_HOME"] = dir
  process.env["TRANSFORMERS_CACHE"] = dir
  process.env["HF_HUB_CACHE"] = dir
  refreshModelStatus()
}

/**
 * Total bytes inside the per-repo cache dir, following symlinks
 * (which is fine for a presence check — double-counting only ever
 * pushes us further above the threshold). Used to decide whether
 * the model is "cached locally" on boot.
 *
 * We deliberately avoid checking a single hard-coded path like
 * `snapshots/<sha>/onnx/model.onnx` — that assumption broke when
 * transformers.js stored the weights under a different subpath in
 * one release and led to the "100 %, banner stuck" bug.
 */
function repoCacheBytes(): number {
  try {
    const dir = getModelDir()
    const repoDir = join(dir, MODEL_REPO_DIR)
    if (!existsSync(repoDir)) return 0
    let total = 0
    const walk = (path: string): void => {
      let entries: string[]
      try {
        entries = readdirSync(path)
      } catch {
        return
      }
      for (const name of entries) {
        const full = join(path, name)
        let s
        try {
          s = statSync(full)
        } catch {
          continue
        }
        if (s.isDirectory()) walk(full)
        else if (s.isFile()) total += s.size
      }
    }
    walk(repoDir)
    return total
  } catch {
    return 0
  }
}

/**
 * Re-read the cache directory to decide the current model state.
 *
 *   - cache size ≥ READY_THRESHOLD_BYTES → "ready"
 *   - cache exists but smaller → still "downloading" if already set,
 *     otherwise "missing" (don't claim downloading without a trigger)
 *   - no cache → "missing"
 *
 * Real-time progress during a download is driven by the worker's
 * `model-download` JSONL events (see worker-bridge.ts), not by this
 * function — Hugging Face writes weights into `blobs/<hash>` with
 * `snapshots/<sha>/...` as symlinks, so polling the snapshot tree
 * for partial bytes is unreliable. `refreshModelStatus` is now only
 * for boot-time detection and post-download confirmation.
 */
export function refreshModelStatus(): ModelStatus {
  const size = repoCacheBytes()
  if (size >= READY_THRESHOLD_BYTES) {
    currentStatus = { state: "ready" }
  } else if (currentStatus.state !== "downloading") {
    currentStatus = { state: "missing" }
  }
  notify()
  return currentStatus
}

/**
 * Set the initial "downloading 0/<expected>" status so the renderer
 * banner shows feedback immediately when the user clicks Download.
 * The worker's `progress_callback` will overwrite the byte counts
 * within ~1 second as it starts pulling from Hugging Face.
 *
 * No-op if the model is already ready (don't clobber the success
 * state with a synthetic download state).
 */
export function markDownloadStarting(): void {
  if (currentStatus.state === "ready") return
  currentStatus = {
    state: "downloading",
    downloaded: 0,
    total: EXPECTED_TOTAL_BYTES,
  }
  notify()
}

/**
 * Recursive byte-count of the model cache directory. Used by the
 * Settings → Model panel to surface disk usage and by `clearModelCache`
 * to report what was freed.
 */
export function getModelCacheBytes(): number {
  const dir = getModelDir()
  if (!existsSync(dir)) return 0
  let total = 0
  const walk = (path: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(path)
    } catch {
      return
    }
    for (const name of entries) {
      const full = join(path, name)
      let s
      try {
        s = statSync(full)
      } catch {
        continue
      }
      if (s.isDirectory()) walk(full)
      else if (s.isFile()) total += s.size
    }
  }
  walk(dir)
  return total
}

/**
 * Delete the contents of the model cache directory (but keep the dir
 * itself so the worker doesn't have to re-create it on next launch).
 * Used by Settings → Re-download model.
 */
export function clearModelCache(): { freedBytes: number } {
  const dir = getModelDir()
  const freedBytes = getModelCacheBytes()
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      try {
        rmSync(join(dir, name), { recursive: true, force: true })
      } catch {
        // Best-effort. If a file is locked (worker holding it) we
        // swallow; the worker will be told to restart by the IPC
        // handler before this is called.
      }
    }
  }
  // Reset status — the next refresh will see an empty cache.
  currentStatus = { state: "missing" }
  notify()
  return { freedBytes }
}

/**
 * Read the local model revision (the SHA inside refs/main if present).
 * Returns null if the model hasn't been downloaded yet.
 */
export function getLocalModelRevision(): string | null {
  const dir = getModelDir()
  const refsMain = join(dir, MODEL_REPO_DIR, "refs", "main")
  if (!existsSync(refsMain)) return null
  try {
    const fs = require("node:fs") as typeof import("node:fs")
    return fs.readFileSync(refsMain, "utf8").trim() || null
  } catch {
    return null
  }
}

export function setModelStatus(next: ModelStatus): void {
  currentStatus = next
  notify()
}

export function getModelStatus(): ModelStatus {
  return currentStatus
}

export function onModelStatus(cb: (s: ModelStatus) => void): () => void {
  listeners.add(cb)
  // Emit current state immediately so late subscribers don't sit blind.
  cb(currentStatus)
  return () => listeners.delete(cb)
}

function notify(): void {
  for (const cb of listeners) cb(currentStatus)
}
