# Worker internals

The worker is the only process that touches the model, the GPU/CPU
ONNX runtime, and the network for image downloads. It's deliberately
boring: read a JSONL line, do the work, write a JSONL line.

## Entry point

[`src/worker/index.ts`](../src/worker/index.ts):

1. Opens `readline` over `process.stdin`.
2. Kicks off `warmUp()` in the background (loads RMBG-1.4 model and
   processor). When that resolves, emits `{type:"ready"}`.
3. Each inbound `job` is pushed into a FIFO queue; `pump()` drains the
   queue one job at a time.
4. `progress` events are emitted at the natural phase boundaries:
   `loading | downloading | inferring | writing`. The renderer uses
   these to swap the row label without doing per-byte updates.

## RMBG-1.4 wrapper

[`src/worker/background-removal.ts`](../src/worker/background-removal.ts)
is a **verbatim port** of `src/lib/background-removal.ts` from the
TPP Ops repo (see [the source plan](../../Desktop/plan-bgremover-electron.md),
section 13).

Do not edit it for stylistic reasons — diverging from the source means
silently changing the output quality. The only modification we made is
adding an exported `warmUp()` helper so the worker can pre-load the
model on startup rather than paying ~15 s on the first real job.

Key facts:

| Aspect | Value |
|---|---|
| Model | `briaai/RMBG-1.4` (ISNet-based) |
| Runtime | `@huggingface/transformers` → `onnxruntime-node` (CPU) |
| Input size | 1024×1024 (resized internally) |
| Output | original-resolution PNG, RGBA with alpha = mask |
| Warm-up | ~15 s (cold) + ~180 MB model download on first run |
| Per-image | ~0.6–1.5 s after warm-up, depending on resolution |

## Image fetching (URL mode)

[`src/worker/fetch-image.ts`](../src/worker/fetch-image.ts) is the
thin network layer; [`src/worker/url-rewrite.ts`](../src/worker/url-rewrite.ts)
holds the pure helpers (rewrites + headers + content-type guard) so
they can be unit-tested without mocking `fetch`.

### URL gotchas (baked in)

These came from the 90-URL SPORTSGRID validation run. Without them,
roughly 13/90 URLs would fail. See
[`url-rewrite.test.ts`](../src/worker/url-rewrite.test.ts) for the
fixtures locking each behaviour.

1. **Google Drive viewer URLs.**
   `https://drive.google.com/file/d/<ID>/view?usp=sharing` returns
   **HTML** (the viewer page), not the image.
   → Rewritten to
   `https://drive.usercontent.google.com/download?id=<ID>&export=download&authuser=0`.

2. **B&H Photo CDN wrapper.**
   `https://www.bhphotovideo.com/cdn-cgi/image/<params>/https://www.bhphotovideo.com/images/...`
   returns **HTTP 403** with default headers.
   → Inner URL is extracted (everything after `cdn-cgi/image/<params>/`)
   and used directly. B&H direct URLs already work.

3. **Browser headers.**
   Many CDNs return 403 or HTML for default Node fetch headers.
   → Every request goes with a Chrome-shaped `User-Agent` and a
   `Accept: image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5`.
   B&H also gets `Referer: https://www.bhphotovideo.com/`.

4. **Content-Type guard.**
   Some servers cheerfully return HTTP 200 with HTML when they don't
   have the requested image. We refuse anything whose `Content-Type`
   doesn't start with `image/`. The alternative — writing the HTML
   to disk — confuses `sharp` two steps later.

## sharp compositing

After RMBG-1.4 produces the 1024×1024 alpha mask, we:

1. Resize the mask back to the input image's original resolution
   (`RawImage.fromTensor(...).resize(w, h)`).
2. Read the input image as raw RGBA via `sharp(input).ensureAlpha().raw()`.
3. Replace each pixel's alpha channel with the mask byte.
4. Re-encode as PNG.

The PNG output is therefore at **original input resolution**, not the
1024×1024 model resolution. This is the most common gotcha when
porting ISNet-based pipelines — easy to forget the resize step and
ship square images.

## Why no parallelism

`onnxruntime-node` is multi-threaded internally and saturates the CPU
on a single inference. Running two RMBG passes in parallel slows total
throughput vs. serial processing. The worker therefore uses a
single-flight queue.

If you ever want to revisit this:

- Measure first. Don't bump concurrency on a hunch.
- The bottleneck is almost certainly the model forward pass, not the
  sharp decode/encode. Pipeline parallelism (decode-A while infer-B
  while encode-C) is the right shape, not raw N-way concurrent
  inference.

## Logging

- Protocol messages on **stdout**, one JSON per line.
- Human progress (transformers download progress, sharp warnings,
  onnxruntime info) goes to **stderr**.
- Main forwards stderr verbatim to the main-process console with
  a `[worker] ` prefix. In dev that's the terminal running
  `npm run dev`; in prod it's the macOS Console / Windows Event
  Viewer.
- The worker also emits `{type:"log", level, message}` for things
  it wants the renderer to surface eventually (currently swallowed
  — see [gotchas.md](./gotchas.md)).
