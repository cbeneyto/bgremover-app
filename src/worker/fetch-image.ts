/**
 * Network-bound image fetcher. The pure rewrites + header builders
 * live in `./url-rewrite.ts` so they can be unit-tested without a
 * real fetch — this file is just the plumbing on top.
 */

import {
  browserHeadersFor,
  isImageContentType,
  rewriteImageUrl,
} from "./url-rewrite"

export { rewriteImageUrl } from "./url-rewrite"

export interface FetchedImage {
  buffer: Buffer
  mimeType: string
}

export async function fetchImage(url: string): Promise<FetchedImage> {
  const rewritten = rewriteImageUrl(url)
  const headers = browserHeadersFor(rewritten)
  const res = await fetch(rewritten, { headers, redirect: "follow" })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${rewritten}`)
  }
  const ct = res.headers.get("content-type")
  if (!isImageContentType(ct)) {
    throw new Error(
      `Expected image content-type, got "${ct ?? "missing"}" — ${rewritten}`,
    )
  }
  const ab = await res.arrayBuffer()
  return { buffer: Buffer.from(ab), mimeType: (ct ?? "").split(";")[0].trim() }
}
