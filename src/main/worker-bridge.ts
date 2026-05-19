/**
 * Bridges the main process and the Node sidecar worker.
 *
 * Why a sidecar at all: `sharp` and `onnxruntime-node` ship native
 * binaries built for the Node ABI. Running them inside Electron's
 * Node fork requires `@electron/rebuild` to rebuild against the
 * Electron ABI — which is fragile, slow, and adds a hard dependency
 * on a working C/C++ toolchain on every dev machine. Spawning a
 * vanilla Node process instead keeps those prebuilts working as-is.
 *
 * Dev vs prod:
 *   - In dev, we use the developer's local `node` binary and run the
 *     worker through `tsx` so we don't have to bundle on every edit.
 *   - In packaged builds, we ship a Node binary under
 *     `resources/node-bin` and run the bundled worker (`out/worker/index.js`)
 *     directly.
 *
 * Protocol: one JSON object per stdout line. We buffer stdout and
 * split on \n; partial lines are kept until the next chunk arrives.
 */

import { app } from "electron"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"

import { createJsonlBuffer, type JsonlBuffer } from "../shared/jsonl"
import type { WorkerInbound, WorkerOutbound } from "../shared/protocol"
import {
  getModelDir,
  getModelStatus,
  setModelStatus,
} from "./model-manager"

let worker: ChildProcessWithoutNullStreams | null = null
let stdoutBuf: JsonlBuffer = createJsonlBuffer()
let listener: ((event: WorkerOutbound) => void) | null = null

/**
 * When the worker exits, we usually want to respawn it transparently
 * — that's how `cancelBatch` and `clearModelCache` recover without
 * leaving the renderer unable to start a new batch.
 *
 * This flag suppresses respawn for the one case where we DON'T want
 * it: the app is quitting. Set via `shutdownPermanently()`.
 */
let permanentShutdown = false

/**
 * Called on every spawn so we know what to do with `exit`. Tracks
 * whether we should treat the next exit as expected — currently
 * always false on spawn; toggled to true only by `shutdownPermanently`.
 */
function shouldRespawnAfterExit(): boolean {
  return !permanentShutdown && listener != null
}

function resolveNodeBinary(): string {
  // Packaged: ship a node binary under resources/node-bin.
  if (app.isPackaged) {
    const packaged = join(
      process.resourcesPath,
      "node-bin",
      process.platform === "win32" ? "node.exe" : "node",
    )
    if (existsSync(packaged)) return packaged
    // Fall back to whatever node is on PATH (best-effort if asar
    // unpack misbehaves). On a clean machine this will fail loudly,
    // which is what we want — better than silently hanging.
    return process.platform === "win32" ? "node.exe" : "node"
  }
  // Dev: prefer a system `node` (electron's own exec wouldn't work
  // for our needs because it runs the Chromium runtime).
  return process.platform === "win32" ? "node.exe" : "node"
}

function resolveWorkerArgs(): string[] {
  if (app.isPackaged) {
    return [join(process.resourcesPath, "worker", "index.js")]
  }
  // Dev: run the bundled worker so we don't depend on `tsx` at runtime.
  // `npm run dev` should have produced `out/worker/index.js` via a
  // pre-step; if not, we fall back to invoking tsx for the TS source.
  const cwd = process.cwd()
  const bundled = join(cwd, "out", "worker", "index.js")
  if (existsSync(bundled)) return [bundled]
  // Fallback: spawn via tsx (requires `npm i` to have installed it).
  return [
    join(cwd, "node_modules", "tsx", "dist", "cli.mjs"),
    join(cwd, "src", "worker", "index.ts"),
  ]
}

/**
 * Resolve the directory that contains the `node_modules` the worker
 * needs at runtime (sharp, onnxruntime-node, @huggingface/transformers).
 *
 * In dev that's the repo root (cwd). In a packaged build it's
 * `Resources/app.asar.unpacked/` — electron-builder extracts native
 * `.node` modules there (see `asarUnpack` in electron-builder.yml).
 *
 * We pass this as the spawn `cwd` AND via NODE_PATH so Node's module
 * resolution algorithm finds the deps no matter what path the
 * worker happens to be loaded from. Without this, the packaged
 * worker can fail to `require('sharp')` because its parent dir
 * (`Resources/worker/`) has no `node_modules/` next to it — Node's
 * upward search then ends in a directory that doesn't contain the
 * deps, and the process exits before the bridge even hears about
 * it.
 */
function resolveDepsRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "app.asar.unpacked")
  }
  return process.cwd()
}

export function startWorker(onEvent: (event: WorkerOutbound) => void): void {
  if (worker) return
  listener = onEvent

  const nodeBin = resolveNodeBinary()
  const args = resolveWorkerArgs()
  const modelDir = getModelDir()
  const depsRoot = resolveDepsRoot()
  const depsNodeModules = join(depsRoot, "node_modules")

  // Log up-front. Packaged builds have no obvious place to surface
  // startup failures otherwise — these lines land in the macOS
  // Console / Windows Event Viewer.
  process.stderr.write(
    `[worker] spawning: ${nodeBin} ${args.join(" ")}\n` +
      `[worker]   cwd: ${depsRoot}\n` +
      `[worker]   NODE_PATH: ${depsNodeModules}\n` +
      `[worker]   modelDir: ${modelDir}\n`,
  )

  try {
    worker = spawn(nodeBin, args, {
      cwd: depsRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Make Node's module resolution find the deps that
        // electron-builder unpacked from asar.
        NODE_PATH: depsNodeModules,
        HF_HOME: modelDir,
        TRANSFORMERS_CACHE: modelDir,
        HF_HUB_CACHE: modelDir,
        // Force CPU; `onnxruntime-node` doesn't ship GPU prebuilts
        // and would otherwise probe for CUDA on Linux/Win.
        ONNXRUNTIME_PROVIDERS: "cpu",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`[worker] spawn threw: ${message}\n`)
    setModelStatus({
      state: "error",
      error: `Worker failed to start: ${message}`,
    })
    worker = null
    return
  }

  // `spawn()` does NOT throw on missing executable — it emits an
  // `error` event asynchronously. Without this handler the worker
  // would silently never start.
  worker.on("error", (err) => {
    process.stderr.write(`[worker] spawn error: ${err.message}\n`)
    setModelStatus({
      state: "error",
      error: `Worker failed to start: ${err.message}`,
    })
  })

  worker.stdout.setEncoding("utf8")
  worker.stdout.on("data", (chunk: string) => {
    for (const line of stdoutBuf.feed(chunk)) handleLine(line)
  })

  worker.stderr.setEncoding("utf8")
  worker.stderr.on("data", (chunk: string) => {
    // Worker stderr is human-readable progress from transformers/sharp.
    // Forward it to the main console for debugging.
    process.stderr.write(`[worker] ${chunk}`)
  })

  worker.on("exit", (code, signal) => {
    process.stderr.write(
      `[worker] exited code=${code} signal=${signal ?? "-"}\n`,
    )
    // Code !== 0 means the worker crashed unexpectedly. If we
    // can't recover (the binary itself is broken), surface
    // something to the user instead of looping silently.
    const unexpected = code !== 0 && code !== null
    worker = null
    stdoutBuf = createJsonlBuffer()
    if (shouldRespawnAfterExit()) {
      // Brief delay so the OS gets a chance to release any file
      // descriptors the old process was holding (model files via
      // mmap, sharp's libpng handles, etc.). Without it, fast
      // respawns occasionally fail to open the same files.
      const cb = listener!
      setTimeout(() => {
        if (!permanentShutdown) startWorker(cb)
      }, 600)
    } else if (unexpected) {
      setModelStatus({
        state: "error",
        error: `Worker exited unexpectedly (code ${code}).`,
      })
    }
  })

  // Tell the worker which cache dir to use (also already in env,
  // but the explicit init message is a useful handshake).
  send({ type: "init", modelDir })

  // Pre-warm: if the model is already on disk, ask the worker to
  // load it now so the user's first real inference doesn't pay the
  // ~3-5s model-load cost. We DON'T pre-warm when the model is
  // missing — that would trigger a surprise ~180 MB download
  // without consent (the user has to click "Download model" first,
  // see docs/model.md).
  //
  // This also runs on every auto-respawn (after cancel / cache
  // clear) — the worker re-loads the model in the background while
  // the user is wiring up their next batch.
  if (getModelStatus().state === "ready") {
    send({ type: "warm-up" })
  }
}

function handleLine(line: string): void {
  let msg: WorkerOutbound
  try {
    msg = JSON.parse(line) as WorkerOutbound
  } catch (err) {
    process.stderr.write(`[worker] bad JSON line: ${line}\n`)
    return
  }
  if (msg.type === "model-download") {
    setModelStatus({
      state: "downloading",
      downloaded: msg.downloaded,
      total: msg.total,
    })
  }
  if (msg.type === "ready") {
    // The worker has finished loading the model into memory — that
    // IS the source of truth for "ready". We deliberately do not
    // verify with a disk read here because the HF cache layout has
    // moving parts (symlinks into blobs/<hash>, optional onnx/
    // subdir, etc.) and a stricter walker has fooled us before:
    // download hits 100 %, worker reports ready, banner stayed
    // stuck because the disk walker couldn't find the file in the
    // exact path it expected.
    setModelStatus({ state: "ready" })
  }
  listener?.(msg)
}

export function send(message: WorkerInbound): void {
  if (!worker) {
    process.stderr.write("[worker] send() called before worker spawned\n")
    return
  }
  worker.stdin.write(JSON.stringify(message) + "\n")
}

export function stopWorker(): void {
  if (!worker) return
  try {
    send({ type: "shutdown" })
  } catch {
    /* ignore */
  }
  // Give it a beat to flush, then kill.
  const w = worker
  worker = null
  setTimeout(() => {
    if (!w.killed) w.kill("SIGTERM")
  }, 500)
}

export function workerIsRunning(): boolean {
  return worker !== null && !worker.killed
}

/**
 * Force-terminate the worker. Used by:
 *   - Settings → Clear model cache (releases file handles before delete)
 *   - cancelBatch (drops the in-flight ONNX inference)
 *
 * The exit handler auto-respawns the worker as long as
 * `permanentShutdown` isn't set, so callers don't need to manage
 * lifecycle — they just trigger the kill and the bridge handles the
 * rest.
 */
export function restartWorker(): void {
  stopWorker()
  // The exit handler does the respawn — nothing else needed here.
}

/**
 * Suppress the auto-respawn behaviour. Called once from the app's
 * `before-quit` hook so the worker stays dead during shutdown.
 */
export function shutdownPermanently(): void {
  permanentShutdown = true
  stopWorker()
}
