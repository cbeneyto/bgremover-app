/**
 * Background removal powered by briaai/RMBG-1.4 running via
 * @huggingface/transformers (ONNX runtime, pure Node — no Python,
 * no external service).
 *
 * This file is a direct port of `src/lib/background-removal.ts` from
 * the TPP Ops repo (see plan, section 13). Keep the implementation
 * in sync — diverging will silently change the output quality.
 *
 * Why RMBG-1.4? ISNet-based, significantly better edge quality on
 * subjects with complex backgrounds (crowds, similar colours, fine
 * detail like fabric or hair) than the alternatives we evaluated.
 * ~0.6–1.5s per 800x800 image on CPU after the model is warm.
 *
 * The model weights (~180MB) are downloaded to $HF_HOME on the first
 * call and cached across invocations. The main process sets HF_HOME
 * to electron's userData/models before spawning this worker.
 */

import {
  AutoModel,
  AutoProcessor,
  env as transformersEnv,
  RawImage,
  type PretrainedConfig,
} from "@huggingface/transformers"
import sharp from "sharp"

import type { EdgeMode } from "@shared/protocol"
import { applyEdgeMode } from "./mask-postprocess"

/**
 * Point `@huggingface/transformers` at our chosen cache directory.
 *
 * The Python HF library reads `HF_HOME` / `TRANSFORMERS_CACHE`. The
 * JS port DOES NOT. It uses its own `env.cacheDir` (defaults to
 * `./.cache` relative to the running script — i.e. inside
 * `node_modules/@huggingface/transformers/.cache/`, which is the
 * WRONG place: read-only in a packaged asar build, and not under
 * the app's userData so model persistence is fragile).
 *
 * Call this once on worker boot (from the `init` message handler)
 * with the path Electron's `app.getPath("userData")/models` gave us.
 * Everything from `AutoModel.from_pretrained` onward then resolves
 * against that directory.
 */
export function setCacheDir(dir: string): void {
  transformersEnv.cacheDir = dir
}

type RmbgModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>
type RmbgProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>

let cachedModel: RmbgModel | null = null
let cachedProcessor: RmbgProcessor | null = null

/**
 * Optional hook that receives cumulative download progress while
 * `@huggingface/transformers` pulls weights from the Hugging Face
 * hub. The worker calls `setDownloadProgressHook` once on boot to
 * forward these into JSONL `model-download` messages.
 *
 * We track per-file `{loaded, total}` and sum across files because
 * transformers.js's progress events are per-file (not cumulative).
 * The model load involves the .onnx weights (big) + a handful of
 * tiny config JSONs.
 */
export type DownloadProgressHook = (downloaded: number, total: number) => void
let downloadProgressHook: DownloadProgressHook | null = null
const fileProgress = new Map<string, { loaded: number; total: number }>()

export function setDownloadProgressHook(hook: DownloadProgressHook): void {
  downloadProgressHook = hook
}

/**
 * Loose shape we extract from the transformers.js progress event.
 * The library's `ProgressInfo` union changes across versions; we
 * only care about per-file byte counts and a file name, so we read
 * the fields defensively.
 */
function onTransformersProgress(raw: unknown): void {
  const p = raw as {
    file?: unknown
    loaded?: unknown
    total?: unknown
  }
  const file = typeof p.file === "string" ? p.file : null
  const loaded = typeof p.loaded === "number" ? p.loaded : null
  const total = typeof p.total === "number" ? p.total : null
  if (!file || loaded == null || total == null) return
  fileProgress.set(file, { loaded, total })
  let cumLoaded = 0
  let cumTotal = 0
  for (const v of fileProgress.values()) {
    cumLoaded += v.loaded
    cumTotal += v.total
  }
  // Bail if we haven't seen any totals yet (keeps the bar from
  // flashing 0/0 in the renderer).
  if (cumTotal === 0) return
  downloadProgressHook?.(cumLoaded, cumTotal)
}

async function getModel(): Promise<RmbgModel> {
  if (!cachedModel) {
    cachedModel = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
      config: { model_type: "custom" } as unknown as PretrainedConfig,
      progress_callback: onTransformersProgress,
    })
  }
  return cachedModel
}

async function getProcessor(): Promise<RmbgProcessor> {
  if (!cachedProcessor) {
    cachedProcessor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
      config: {
        do_normalize: true,
        do_pad: false,
        do_rescale: true,
        do_resize: true,
        image_mean: [0.5, 0.5, 0.5],
        feature_extractor_type: "ImageFeatureExtractor",
        image_std: [1, 1, 1],
        resample: 2,
        rescale_factor: 1 / 255,
        size: { width: 1024, height: 1024 },
      } as unknown as PretrainedConfig,
      progress_callback: onTransformersProgress,
    })
  }
  return cachedProcessor
}

/**
 * Pre-warm the model+processor. Call this once on worker startup so
 * the first real job doesn't pay the ~15s warm-up. Triggers the
 * model download if it isn't cached.
 */
export async function warmUp(): Promise<void> {
  await Promise.all([getModel(), getProcessor()])
}

/**
 * Runs RMBG-1.4 on an image buffer and returns a PNG buffer with a
 * transparent background at the original image resolution.
 *
 * `edgeMode` controls how the raw model mask is converted into the
 * alpha channel — see src/worker/mask-postprocess.ts.
 */
export async function removeBackground(
  input: Buffer,
  mimeType: string = "image/jpeg",
  edgeMode: EdgeMode = "soft",
): Promise<Buffer> {
  const [model, processor] = await Promise.all([getModel(), getProcessor()])

  const blob = new Blob([new Uint8Array(input)], { type: mimeType })
  const image = await RawImage.read(blob)

  const { pixel_values } = await processor(image)
  const { output } = await model({ input: pixel_values })

  const mask = await RawImage.fromTensor(
    output[0].mul(255).to("uint8"),
  ).resize(image.width, image.height)

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Apply the user-chosen edge treatment to the mask BEFORE writing
  // it into the alpha channel. `applyEdgeMode` returns a fresh array
  // — keeps the raw model tensor immutable in case we want to log it.
  const maskData = applyEdgeMode(mask.data as Uint8Array, edgeMode)
  for (let i = 0; i < maskData.length; i++) {
    data[i * 4 + 3] = maskData[i]
  }

  const pngBuffer = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer()

  return pngBuffer
}
