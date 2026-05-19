# Model management

The model (RMBG-1.4, ~180 MB ONNX) is downloaded **once** to a cache
directory and reused forever after. It is **not** bundled in the
installer — that would push every dmg past 350 MB and make first-launch
identical for online and offline users (you'd ship the model for users
who already have it; users who don't, get nothing extra).

## Cache location

Pointed at Electron's per-app `userData`:

- macOS: `~/Library/Application Support/Background Remover/models/`
- Windows: `%APPDATA%/Background Remover/models/`
- Linux (untested): `~/.config/Background Remover/models/`

The directory is created on app start by `ensureModelDir()` in
[`src/main/model-manager.ts`](../src/main/model-manager.ts).

### Pointing transformers.js at the right place — the trap

The Python HF ecosystem reads `HF_HOME`, `TRANSFORMERS_CACHE`, and
`HF_HUB_CACHE`. **`@huggingface/transformers` (the JS port) does
not.** It has its own knob: `env.cacheDir`.

Default `env.cacheDir` is `./.cache` resolved relative to the
running script — i.e. inside
`node_modules/@huggingface/transformers/.cache/`. In dev that
"works" (node_modules is writable), but:

- it leaks the model into the dev's checkout (huge dir, easy to
  accidentally commit, lost on `rm -rf node_modules`),
- it is **read-only inside a packaged asar archive**, so production
  builds would fail to cache anything,
- the boot-time presence check at `userData/models/...` would
  always see an empty dir and prompt the user to re-download on
  every launch (the exact bug a tester hit).

Fix: the worker calls `setCacheDir(modelDir)` on the `init`
message (see
[`src/worker/index.ts`](../src/worker/index.ts) and
[`src/worker/background-removal.ts`](../src/worker/background-removal.ts)).
This points the library at `userData/models/`. We still export the
Python env vars too as belt-and-suspenders in case a future
library version honours them.

### Layout under `env.cacheDir`

`@huggingface/transformers` writes files at:

```
<cacheDir>/<org>/<repo>/<file...>
```

For RMBG-1.4 specifically:

```
userData/models/
└── briaai/
    └── RMBG-1.4/
        ├── preprocessor_config.json
        └── onnx/
            └── model.onnx     # ~168 MB
```

This is **not** the Python HF Hub layout
(`models--<org>--<repo>/snapshots/<sha>/...`). An earlier version
of the boot detector walked the wrong path and never found the
weights — leading to the "always asks to download" symptom.
`repoCacheBytes` in
[`model-manager.ts`](../src/main/model-manager.ts) now walks
`briaai/RMBG-1.4/` directly.

## Status detection

`refreshModelStatus()` walks the HF cache layout looking for the
largest `.onnx` file under `models--briaai--RMBG-1.4/snapshots/<sha>/onnx/`.
The status is one of:

| State | Trigger |
|---|---|
| `checking` | initial; only seen briefly on app start |
| `missing` | no `.onnx` found |
| `downloading` | partial `.onnx` found (smaller than the 10 MB sanity floor) **or** the worker emits a `model-download` progress event |
| `ready` | `.onnx` ≥ 10 MB present |
| `error` | something blew up (only fired manually) |

A 10 MB floor catches half-downloaded states without false positives —
the real weights are ~180 MB and there's no smaller real file to confuse
us with.

## First-launch flow

The download is **explicit**, not silent. We deliberately do not
fetch ~180 MB without the user asking — a surprise network burst on
a managed laptop is a fast way to get reported as malware.

1. App starts → `ensureModelDir()` → status reports `missing` (no `.onnx`).
2. Worker spawns and waits idle. **No automatic warm-up.** Reading
   the worker's first lines on stderr in dev mode you'll see no
   transformers output until step 4.
3. Renderer shows the yellow `ModelDownloadBanner` with a
   "Download model" button. The "Process" button is also active —
   clicking it has the same effect on the worker (lazy warm-up).
4. User clicks **Download model** (or **Process**):
   - Main's `download-model` IPC handler sends `{type:"warm-up"}` to
     the worker and starts a 1.5-second disk-size poll
     (`startDownloadPolling` in [`model-manager.ts`](../src/main/model-manager.ts)).
   - The worker calls `warmUp()`. `@huggingface/transformers`
     notices the cache is empty and starts downloading.
   - Main's poll reads the `.onnx` file size and emits
     `model:status` events with state `downloading` + the current
     byte count.
5. When the file size crosses the 10 MB threshold the status flips
   to `ready`, the banner disappears, and `clearInterval(pollTimer)`.

Subsequent launches: `ensureModelDir()` finds the existing weights
and reports `ready` immediately. The banner never appears.

The worker emits `{type:"error", id:"warm-up", message}` on a
warm-up rejection (e.g., no internet). Main maps that to a model
status of `error` so the banner switches to the danger tone.

## Why the worker drives progress (not disk polling)

We tried disk-polling first — read the size of the `.onnx` file in
the cache every 1.5 s and emit byte counts. It didn't work because
Hugging Face's hub layout stores blobs in
`models--<repo>/blobs/<hash>` with `snapshots/<sha>/...` as
**symlinks** to those blobs. During an active download the symlinks
don't exist yet, so a walker that follows them reports 0 bytes the
entire time. The banner showed "Downloading…" with a stuck 0 %
counter — the exact bug the user caught with a screenshot.

The fix is to use the `progress_callback` option that
`AutoModel.from_pretrained` / `AutoProcessor.from_pretrained`
already accept. transformers.js fires the callback per file with
`{file, loaded, total}`. We track these in a Map in the worker
([`src/worker/background-removal.ts`](../src/worker/background-removal.ts)
`onTransformersProgress`), sum across files, and emit a single
cumulative `model-download` JSONL message. Main's `worker-bridge`
turns each one into a `model:status` event for the renderer.

Disk polling now exists only as a one-shot check used at app start
to detect a pre-existing model. **We do NOT verify "ready" against
disk** when the worker says it's ready — we trust the worker. That
trust matters: the previous version disk-walked
`snapshots/<sha>/onnx/*.onnx` looking for the weights, but the
transformers.js layout doesn't always put them under `onnx/`, so
the walker would return 0 even after a successful download. The
banner sat stuck at 100 % until app restart. Now the
`{type:"ready"}` event from the worker is the source of truth —
that event only fires after `AutoModel.from_pretrained(...)`
resolves, which by definition means the model is loaded.

The boot-time presence check uses a recursive byte count of the
whole repo cache (`repoCacheBytes` in
[`src/main/model-manager.ts`](../src/main/model-manager.ts)) with
a 100 MB threshold. Robust to layout shuffles in future
transformers.js releases.

## Manual reset

If the model file gets corrupted (rare — the cache layout is
content-addressed by sha256), nuke the cache dir and relaunch:

```bash
# macOS
rm -rf ~/Library/Application\ Support/TPP\ Background\ Remover/models/

# Windows (PowerShell)
Remove-Item -Recurse -Force "$env:APPDATA\TPP Background Remover\models"
```

The app will redownload on next launch.
