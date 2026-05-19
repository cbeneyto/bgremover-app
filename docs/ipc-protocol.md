# IPC and worker protocol

The single source of truth for all message shapes is
[`src/shared/protocol.ts`](../src/shared/protocol.ts). This doc explains
**what** each channel does and **when** it fires.

## Renderer ↔ main (IPC)

The renderer is sandboxed. Its only access to Node-side state is via
`window.api`, exposed by [`src/preload/index.ts`](../src/preload/index.ts).
Every method is either:

- a **request/response** call via `ipcRenderer.invoke("...")`, or
- a **streamed subscription** via `ipcRenderer.on("...")` (the returned
  cleanup function unregisters the listener).

### Request/response methods

| Method | Channel | Returns | Purpose |
|---|---|---|---|
| `pickFolder()` | `pick-folder` | `string \| null` | Native folder dialog. |
| `pickSaveFolder()` | `pick-save-folder` | `string \| null` | Native folder dialog (output picker). |
| `pickFile(filters?)` | `pick-file` | `string \| null` | Native file dialog, defaults to `.xlsx/.csv/.tsv`. |
| `listFolderImages(dir)` | `list-folder-images` | `string[]` | Absolute paths to `.jpg/.jpeg/.png/.webp` files, sorted. |
| `readSpreadsheetLocal(filePath)` | `read-spreadsheet-local` | `SpreadsheetMeta` | Parse the file, return sheets + headers. |
| `readSpreadsheetUrl(url)` | `read-spreadsheet-url` | `SpreadsheetMeta` | Download (handles Google Sheets export rewrite) → parse. |
| `extractColumnUrls({filePath, sheetName, columnLetter})` | `extract-column-urls` | `string[]` | Extract http(s) URLs from the chosen column. Skips empties and non-URLs. |
| `getModelStatus()` | `get-model-status` | `ModelStatus` | Current state of the model cache. |
| `downloadModel()` | `download-model` | `void` | Kick off the model warm-up. Idempotent. |
| `clearModelCache()` | `clear-model-cache` | `{freedBytes}` | Restart worker + delete cached weights. |
| `openModelCacheFolder()` | `open-model-cache-folder` | `void` | `shell.openPath(modelDir)`. |
| `setEdgeMode(mode)` | `set-edge-mode` | `void` | Push the user's edge-mode preference to the worker. |
| `checkModelUpdates()` | `check-model-updates` | `{repo, localRevision, remoteRevision, upToDate}` | Compare local vs HF revision SHAs. |
| `getAppInfo()` | `get-app-info` | `{appVersion, electronVersion, nodeVersion, platform, modelCacheBytes, modelCacheDir}` | Used by the About panel. |
| `startBatch({jobs})` | `start-batch` | `{ok:true} \| {ok:false, error:string}` | Hand off a job list to the worker. |
| `cancelBatch()` | `cancel-batch` | `void` | Soft-kill the worker; respawned on next batch. |

### Streamed events

| Event | Channel | Payload | Fired by |
|---|---|---|---|
| `onJobUpdate(cb)` | `job:state` | `JobState` | Main, for every worker `progress` / `done` / `error`, plus initial `pending`. |
| `onBatchSummary(cb)` | `batch:summary` | `BatchSummary` (`{total, done, failed}`) | Main, after every job state transition. |
| `onModelStatus(cb)` | `model:status` | `ModelStatus` | Main, when the model state changes (initial check, downloading, ready). |

## Main ↔ worker (JSONL over stdio)

The worker is spawned with `spawn(nodeBin, args, {stdio: ["pipe","pipe","pipe"]})`.
Each line on stdin is one JSON object; each line on stdout is one JSON
object. stderr is reserved for human-readable progress (forwarded
verbatim to the main process console) — it must never carry protocol
data.

### Inbound (main → worker)

```ts
type WorkerInbound =
  | { type: "init"; modelDir: string }
  | { type: "warm-up" }                    // trigger model load + download
  | { type: "set-config"; edgeMode: EdgeMode }  // user pref change
  | { type: "job"; id: string; kind: "file"; input: string; output: string }
  | { type: "job"; id: string; kind: "url"; url: string; output: string }
  | { type: "cancel"; id: string }         // currently no-op unless queued
  | { type: "shutdown" }
```

`warm-up` is idempotent — the worker tracks a `warmingUp` flag so
repeated messages are a no-op. The worker **also** auto-triggers
warm-up on the first `job` so the user can hit Process without
clicking Download first.

### Outbound (worker → main)

```ts
type WorkerOutbound =
  | { type: "ready" }
  | { type: "progress"; id: string; phase: JobPhase; bytes?: number }
  | { type: "done"; id: string; outputPath: string; ms: number }
  | { type: "error"; id: string; message: string }
  | { type: "model-download"; downloaded: number; total: number }
  | { type: "log"; level: "info"|"warn"|"error"; message: string }

type JobPhase = "queued" | "downloading" | "loading" | "inferring" | "writing"
```

## Framing rules

Stdout chunks from a child process are **not guaranteed to be line-aligned**.
[`src/shared/jsonl.ts`](../src/shared/jsonl.ts) provides the framing buffer
used by `worker-bridge.ts`:

- Append every chunk to an internal buffer.
- Split on `\n`. Yield each complete line trimmed of surrounding
  whitespace (including `\r` from CRLF streams).
- Skip empty lines.
- Hold the trailing partial line for the next chunk.

The buffer is reset whenever the worker exits, so a respawn starts
clean. Unit-tested at 100% line / branch coverage in
[`src/shared/jsonl.test.ts`](../src/shared/jsonl.test.ts).

## Why the worker queues jobs serially

`onnxruntime-node` is already multi-threaded internally — running two
RMBG-1.4 inferences in parallel pegs the CPU and yields **slower** total
throughput than serial. The worker pumps jobs through a FIFO queue
(`src/worker/index.ts` `pump()`).

If a job arrives during another job's inference, it sits in the queue
until the in-flight one completes. The `progress` events for the new
job stay at `queued` until the queue clears — the renderer doesn't show
"running" until the worker actually starts processing.

## Cancellation semantics (MVP)

- `cancelBatch()` in the renderer triggers `cancel-batch` in main.
- Main marks every in-flight `JobState` as `cancelled` and emits a
  final `batch:summary`.
- Main sends `{type:"shutdown"}` to the worker. The worker exits
  cleanly. `worker.on("exit")` in `worker-bridge.ts` clears the
  internal handle.
- The next `start-batch` call will detect `workerIsRunning() === false`
  and fail — **this is an MVP gap**, see [gotchas.md](./gotchas.md) for
  the workaround (manually relaunch the worker by quitting/reopening
  the app).

A future improvement: respawn the worker eagerly on `exit` so cancel
is invisible to the user. Tracked as a known limitation, not a bug.
