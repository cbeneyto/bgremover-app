# Architecture

## Three processes

```
   ┌──────────────────────────┐
   │ Renderer (React + Tailwind) │ ← UI, runs inside Chromium
   │   src/renderer/*          │
   └────────────┬─────────────┘
                │ contextBridge — window.api.*
                ▼
   ┌──────────────────────────┐
   │ Main (Electron Node)     │ ← lifecycle, dialogs, FS, spreadsheet parsing
   │   src/main/*              │
   │   ipc.ts handlers         │
   │   worker-bridge.ts (spawn)│
   │   model-manager.ts        │
   │   input-resolver.ts       │
   └────────────┬─────────────┘
                │ stdin/stdout — JSONL, one message per line
                ▼
   ┌──────────────────────────┐
   │ Worker (vanilla Node)    │ ← RMBG-1.4 inference, image fetch, sharp
   │   src/worker/*            │
   │   spawned with the Node    │
   │   binary under              │
   │   resources/node-bin/       │
   └──────────────────────────┘
```

| Process | Language | Bundle | Entry | Has FS access? | Has network? |
|---|---|---|---|---|---|
| Renderer | TS + React 19 | `out/renderer/` (Vite + Tailwind) | `src/renderer/main.tsx` | No (sandboxed; goes through `window.api`) | Through main only |
| Main | TS | `out/main/index.js` (CJS) | `src/main/index.ts` | Yes | Yes (for spreadsheet URL downloads) |
| Worker | TS | `out/worker/index.js` (CJS) | `src/worker/index.ts` | Yes | Yes (image fetches) |

## Why a separate worker (sidecar)

`sharp` and `onnxruntime-node` ship **native** `.node` binaries prebuilt for
the standard Node ABI. Running them inside Electron's Node fork requires
rebuilding against Electron's ABI (`@electron/rebuild`), which:

- breaks in CI on every Electron bump,
- needs a working C/C++ toolchain on every dev machine,
- adds 10–20 min to builds.

Instead we spawn a **vanilla Node process** (Node 20 LTS, shipped under
`resources/node-bin/`) and talk to it over `stdin`/`stdout` with JSON
lines. The prebuilts work as-is and the worker is fully isolated — a
worker crash never tumbles the window.

The trade-off is installer size: each platform ships an extra ~30 MB Node
binary. Acceptable for an MVP. See [packaging.md](./packaging.md).

## Process lifecycle

1. **App start** (main): `app.whenReady()` → `ensureModelDir()` (creates
   `userData/models`, points `HF_HOME` / `TRANSFORMERS_CACHE` /
   `HF_HUB_CACHE` at it).
2. `registerIpcHandlers()` wires every `ipcMain.handle("...")`.
3. `startWorker()` spawns the Node sidecar with that env and a handshake
   `{type:"init", modelDir}` message. The worker calls `warmUp()` which
   begins loading the RMBG-1.4 weights — downloading them on first run.
4. **Window opens.** Renderer reads model status via `window.api.getModelStatus()`
   and subscribes to `model:status` events.
5. **User starts a batch.** Renderer assembles `JobInput[]` and calls
   `window.api.startBatch({jobs})`. Main forwards each job to the worker
   as a separate JSONL line.
6. Worker processes jobs serially (CPU-bound, no parallelism benefit).
   For each job it emits `{type:"progress", ...}` then either
   `{type:"done", ...}` or `{type:"error", ...}`. Main translates these
   into `job:state` events for the renderer + maintains a running
   `batch:summary`.
7. **Cancel:** main sends `{type:"shutdown"}` to the worker. The worker
   exits, main respawns it lazily on the next batch. Half-in-flight jobs
   are reported as `cancelled`.
8. **App quit:** `before-quit` calls `stopWorker()`.

## Source-tree map

```
src/
├── shared/
│   ├── protocol.ts        ← discriminated unions for worker JSONL + renderer IPC
│   └── jsonl.ts           ← line-framing buffer (used by worker-bridge)
├── main/
│   ├── index.ts           ← createWindow, app lifecycle
│   ├── ipc.ts             ← every ipcMain.handle, batch state, event fan-out
│   ├── worker-bridge.ts   ← spawn vanilla Node, JSONL frame, send/receive
│   ├── model-manager.ts   ← userData/models dir, status state machine
│   └── input-resolver.ts  ← exceljs/papaparse, Google Sheets URL rewrite
├── preload/
│   └── index.ts           ← contextBridge.exposeInMainWorld("api", ...)
├── renderer/
│   ├── App.tsx            ← single-page UI, owns input + output state
│   ├── components/        ← InputModeTabs, PathPicker, ColumnSelector, ProgressList, ModelDownloadBanner
│   ├── hooks/             ← useModelStatus, useJobs
│   └── styles/globals.css
└── worker/
    ├── index.ts           ← JSONL stdin reader, queue, dispatch
    ├── background-removal.ts ← RMBG-1.4 wrapper (verbatim port of TPP Ops)
    ├── fetch-image.ts     ← HTTP fetch with content-type guard
    └── url-rewrite.ts     ← pure URL gotchas (Drive viewer, B&H CDN, headers)

resources/
├── icon.icns / icon.ico   ← (not yet present — TODO)
└── node-binaries/         ← populated by scripts/download-node-binaries.mjs
    ├── mac-arm64/node
    ├── mac-x64/node
    └── win-x64/node.exe

scripts/
└── download-node-binaries.mjs ← fetches Node 20.18.1 + SHA256 verifies
```

## Build pipeline

| Step | Tool | Config | Output |
|---|---|---|---|
| Main + preload + renderer | electron-vite | `electron.vite.config.ts` | `out/main/`, `out/preload/`, `out/renderer/` |
| Worker | Vite (separate config) | `vite.worker.config.ts` | `out/worker/index.js` (CJS) |
| Packaging | electron-builder | `electron-builder.yml` | `release/*.dmg`, `release/*.exe` |
| Sidecar Node binary | `scripts/download-node-binaries.mjs` | (none) | `resources/node-binaries/<os>-<arch>/` |

`npm run build` runs the first two; `npm run pack:mac` / `npm run pack:win`
runs all four (you should run `npm run fetch-node` once before packaging
to populate `resources/node-binaries/`).

## Why this stack

| Choice | Alternative considered | Why we picked this |
|---|---|---|
| Electron 34 | Tauri | Electron has a 10× larger Node ecosystem fit for image processing; Tauri's Rust core would force a rewrite of the pipeline. |
| electron-vite | Webpack, electron-forge | HMR for the renderer, zero boilerplate, native TS, sane externals story for native modules. |
| React 19 + Tailwind | Vue, Svelte, vanilla DOM | Matches the rest of the TPP stack — least friction. |
| Vanilla-Node sidecar | `@electron/rebuild`, Worker threads | Avoids ABI rebuilds; isolates inference crashes; trivial cancellation by killing the child. |
| JSONL stdio protocol | gRPC, websockets | One-process scope, no port allocation, debuggable with `tee`. |
| exceljs + papaparse | xlsx (SheetJS) | exceljs handles the rich-text/hyperlink cells in the SPORTSGRID set without licensing concerns; papaparse for CSV is a sub-50 kB dep. |
| RMBG-1.4 via @huggingface/transformers | bg.js, U²-Net, REMBG (Python) | Already-validated edge quality, pure Node, no Python sidecar. |
