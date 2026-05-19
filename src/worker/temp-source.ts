/**
 * URL-mode source-image stash.
 *
 * For URL jobs, the worker downloads the image into a Buffer, runs
 * inference, writes the output PNG. The source bytes never touch
 * disk — which means the done-modal can't show a "Before" preview
 * for URL jobs (no path to load from).
 *
 * This helper writes a copy of each URL source to a known temp dir
 * during processing. The "done" event carries the temp path back to
 * main, which surfaces it via `JobState.inputPath` so the modal
 * loads it the same way it loads file-mode inputs.
 *
 * Cleanup happens once on app boot — main wipes the dir before the
 * first batch. We don't try to delete per-job because a fast user
 * might open the modal mid-cleanup and miss the preview.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

const SOURCES_DIR = join(tmpdir(), "bgremover-sources")
let dirReady = false

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
}

/** Path on disk where URL sources are stashed. */
export function getSourcesDir(): string {
  return SOURCES_DIR
}

/**
 * Persist the source bytes of a URL job. Returns the absolute path
 * (passed back to main via the `done` event so the renderer can
 * load it with readImageAsDataUrl).
 */
export async function saveSourceForPreview(
  jobId: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (!dirReady) {
    await mkdir(SOURCES_DIR, { recursive: true })
    dirReady = true
  }
  const ext = EXT_BY_MIME[mimeType.toLowerCase()] ?? ".bin"
  // Job IDs are UUID-shaped — safe filename chars only.
  const path = join(SOURCES_DIR, `${jobId}${ext}`)
  await writeFile(path, buffer)
  return path
}
