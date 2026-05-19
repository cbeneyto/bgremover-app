# Known gotchas

Honest list of MVP rough edges. Each entry has the impact, the
workaround, and the file to touch if you're fixing it.

## App-level

### Cancel doesn't auto-respawn the worker ✓ FIXED

The exit handler in
[`src/main/worker-bridge.ts`](../src/main/worker-bridge.ts) now
respawns automatically unless `permanentShutdown` is set. The flag
is only flipped from `before-quit` in
[`src/main/index.ts`](../src/main/index.ts), so cancel-batch /
clear-cache / unexpected worker crashes all recover transparently.

The respawn waits 600 ms so the OS can release file descriptors;
fast respawns occasionally fail to re-open the same files
otherwise (sharp's libpng, mmap'd ONNX weights).

Pre-warm runs on every spawn (initial + respawn) if the model is
already cached, so the next batch's first job is fast even after
a cancel.

### Offline-first run shows a generic banner ✓ FIXED

The worker now emits `{type:"error", id:"warm-up", message}` on a
warm-up rejection (see [`src/worker/index.ts`](../src/worker/index.ts)
`triggerWarmUp`). Main's worker-bridge translates that into a
`ModelStatus` with state `error`, which flips the banner to the
danger tone with the underlying error message.

Test by disabling WiFi before launching, clicking **Download model**:
expect a red banner saying "Model error — fetch failed".

### Worker `log` events are swallowed by main

**What:** the worker emits `{type:"log", level, message}` for things
it wants the renderer to surface. [`src/main/ipc.ts`](../src/main/ipc.ts)
forwards them on the `worker:log` channel, but the renderer doesn't
subscribe yet.

**Fix:** add `onWorkerLog` to `RendererApi`, subscribe in `App.tsx`,
push into a debug panel. Low priority — current logs are visible in
the dev terminal.

### App asks to re-download the model every launch ✓ FIXED

**What was happening:** every time the app started, the banner
showed "First-time setup — click Download model". After the user
downloaded (visibly hitting 100 %), the next launch asked again.
The model wasn't being persisted.

**Root cause:** two bugs stacked.
1. `@huggingface/transformers` does NOT read `HF_HOME` /
   `TRANSFORMERS_CACHE`. It uses its own `env.cacheDir`. We never
   set it, so the library defaulted to
   `node_modules/@huggingface/transformers/.cache/`. Downloads
   went there, not to userData.
2. Even if (1) had worked, the boot-time detector was walking
   `models--briaai--RMBG-1.4/snapshots/<sha>/onnx/` — the Python
   HF Hub layout. The JS port uses the flat `briaai/RMBG-1.4/`
   layout. The walker found nothing and the app forever
   considered the model missing.

**Fix:** worker now calls `setCacheDir(modelDir)` on its `init`
message. Boot detector walks `userData/models/briaai/RMBG-1.4/`
via `repoCacheBytes`. Both changes shipped together —
[model.md](./model.md) has the long-form write-up.

If you already have a stranded model from a previous version:
1. Find it: `find ~/Library/Application\ Support node_modules -name "model.onnx" -size +50M 2>/dev/null`
2. Copy `briaai/` and its contents to
   `~/Library/Application Support/Background Remover/models/`
3. The app should auto-warm on next launch.

### Dark mode flashes light on first paint ✓ FIXED

The boot splash in
[`src/renderer/index.html`](../src/renderer/index.html) ships with an
inline `<script>` that reads the theme preference from localStorage
(same key as `useSettings`) and applies `.dark` / `.light` to
`<html>` before any stylesheet loads. The inline `<style>` block
then uses that class to paint the splash + body background in the
correct theme from the very first frame.

`BrowserWindow.backgroundColor` in main is still `#fafaf9` — that
shows for the ~5 ms before Electron renders the HTML — but it's so
brief and the splash covers it immediately that there's no visible
flash anymore.

### Icons missing

**What:** `resources/icon.icns` and `resources/icon.ico` don't exist.
electron-builder uses defaults (generic Electron icon).

**Fix:** generate icons from a 1024×1024 source PNG via
[`electron-icon-builder`](https://github.com/safu9/electron-icon-builder)
or similar. Drop both files into `resources/`.

## Worker-level

### First inference pays warm-up even on warm cache ✓ FIXED

The bridge now sends `{type:"warm-up"}` to the worker immediately
after spawn if `getModelStatus().state === "ready"`. The worker
loads the model in the background while the user is still wiring
up inputs, so by the time they click Process the first job runs at
the steady-state ~1 s pace.

This applies to:
- App launch (initial worker spawn).
- Auto-respawn after cancel or cache clear.

It does **not** apply when the model isn't on disk yet — that path
still requires an explicit "Download model" click, deliberately, so
users aren't surprised by a ~180 MB download (see docs/model.md).

If a user clicks Process before warm-up finishes, the job queues
behind `warmUp()` and runs in order (the worker's lazy-warm guard
makes the second trigger a no-op). The first job still pays the
remainder of the warm-up time but no more than the model-load
already in flight.

### `cancel` per-job is best-effort

**What:** `{type:"cancel", id}` to the worker only removes the job
from the queue if it hasn't started yet. A mid-inference job can't
be interrupted — ONNX doesn't expose a cancellation API.

**Why:** see [ipc-protocol.md](./ipc-protocol.md). For MVP we rely
on full-worker shutdown instead.

### URL-mode jobs serialise behind file-mode jobs

**What:** if you start a folder batch and then a URL batch, the URL
jobs wait for every file job to finish.

**Why:** the worker has one queue. No prioritisation, no
parallelism. Acceptable for MVP — users don't run two batches at
once in practice.

## Performance opportunities (not bugs)

Inventory of things that could be faster but aren't broken. Ordered
by impact / cost ratio. None are tracked as bugs because the app
behaves correctly today — these are honest "we could do better"
items if the use case demands it.

### B — Pipeline `download N+1` while `infer N` in URL mode

**Today:** worker processes URL jobs serially. Per job:
`download (300-800 ms) → infer (600-1500 ms) → write (50 ms)`. The
CPU is idle during downloads; the network is idle during inference.

**Idea:** keep the worker queue serial for inference, but spawn the
fetch for job N+1 the moment job N's `removeBackground()` starts.
Hold the buffer in memory until N finishes, then pass it straight
to the next inference. Memory bound: 1 buffered image at a time.

**Expected:** 20–30 % faster on URL batches. The 90-image SPORTSGRID
run would drop from ~110 s to ~80 s. Not measured.

**Cost:** medium refactor (~40 lines). The queue becomes a tiny
producer-consumer pipeline. Need careful error handling so a failed
fetch for N+1 doesn't poison job N+2.

### C — Retry once with backoff on transient HTTP errors

**Today:** the URL fetcher fails the row immediately on any non-2xx
response. On the SPORTSGRID test set we lose 2–3 rows per run to
transient 503s and connection resets.

**Idea:** wrap `fetchImage()` in a single retry with 500 ms backoff
when the failure is a network reset or a 5xx. 4xx (404, 403) is
permanent — don't retry those.

**Expected:** recovers most of the transient failures. Total
success rate goes from ~96 % to ~99 %.

**Cost:** ~20 lines in `src/worker/fetch-image.ts`. Low risk.

### D — Ship DM Sans locally instead of Google Fonts

**Today:** [`globals.css`](../src/renderer/styles/globals.css)
imports DM Sans from `fonts.googleapis.com`. First run with no
internet falls back to system sans-serif (Helvetica on macOS,
Segoe UI on Windows). Looks fine but not branded.

**Idea:** vendor the four weight files (~50 KB total after WOFF2
compression) into `resources/fonts/` and use a `@font-face` rule
pointing at them.

**Expected:** zero network dependency for the renderer. Eliminates
one of the few remaining "needs internet to look right" gotchas.

**Cost:** ~30 lines + 50 KB binary asset.

### E — Lazy-load the SettingsDrawer

**Today:** every renderer bundle includes the drawer + edge-mode
glyphs + everything in About even though most users open Settings
zero times per session.

**Idea:** dynamic `import()` the drawer on first open via
`React.lazy`. Initial bundle ~15 KB smaller.

**Expected:** marginal — bundle is already loaded from disk inside
the app, not over the network. Skip unless we ship many more
panels.

### F — Virtualise the job list for very large batches

**Today:** the progress list renders every row as a real DOM node.
At 90 rows this is fine (~5 ms render). At 1000+ rows React's
diffing starts to bite.

**Idea:** integrate `react-window` (~6 KB gzipped).

**Expected:** lag-free 10 k-job batches. Premature for the current
use case.

**Cost:** ~80 lines + new dependency. Skip until a real user runs
into it.

## Build/packaging

### `wine-stable` required to build `.exe` on macOS

**What:** `npm run pack:win` on a Mac needs Wine to assemble the NSIS
installer.

**Fix:** `brew install --cask wine-stable`, or run the Windows build
in CI on a real Windows runner.

### Universal `.dmg` is not built

**What:** only `arm64` is in the build matrix. Intel Macs (and some
Rosetta scenarios) will need a separate build.

**Fix:** add `x64` to the `mac.target[].arch` array in
[`electron-builder.yml`](../electron-builder.yml). Doubles the build
time and installer size — only do this if you actually have Intel
users to ship to.

### `extraResources` copies node binaries for every platform

**What:** the `extraResources` `from: resources/node-binaries/${os}-${arch}`
expansion only copies the matching platform's directory. But all
three directories are staged on disk after `npm run fetch-node` —
they're not pruned.

**Why:** that's the cheap path. Pruning them would mean conditional
fetching by `process.platform`, which doesn't help CI matrix builds.

**Fix:** if you really care, gate `fetch-node` behind a target flag
(`--target=mac-arm64`) and only stage that one. Not worth the
complexity for MVP.

### Coverage threshold doesn't enforce on uncovered files

**What:** `coverage.include` in `vitest.config.ts` whitelists the
files subject to the gate. New files added outside that list won't
fail the build even if untested.

**Why deliberate:** see [testing.md](./testing.md). Some files are
genuinely impure (Electron lifecycle, native binaries) and can't be
unit tested.

**Discipline:** when you add a new pure module, add it to
`coverage.include`. Reviewers should grep for this when approving
PRs that touch `src/main/` or `src/worker/`.
