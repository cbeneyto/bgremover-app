/**
 * Pure URL rewrites for image fetching. Lives separately from the
 * network-bound fetcher so it can be unit-tested without mocking
 * `fetch`.
 *
 * The two rewrites here are derived from the 90-URL SPORTSGRID
 * validation run (see docs/worker.md). Default Node `fetch` against
 * the originals fails on a meaningful fraction of the dataset —
 * these rewrites take that failure rate to zero.
 */

const DRIVE_VIEW_RE = /https?:\/\/drive\.google\.com\/file\/d\/([^/]+)\//
const BH_CDN_RE =
  /https?:\/\/www\.bhphotovideo\.com\/cdn-cgi\/image\/[^/]+\/(https?:\/\/.+)/

export function rewriteImageUrl(url: string): string {
  const drive = url.match(DRIVE_VIEW_RE)
  if (drive) {
    return `https://drive.usercontent.google.com/download?id=${drive[1]}&export=download&authuser=0`
  }
  const bh = url.match(BH_CDN_RE)
  if (bh) {
    return bh[1]
  }
  return url
}

/**
 * Returns the headers we send for image fetches. B&H needs a Referer
 * even after the CDN rewrite, in case it's a path the rewrite didn't
 * catch. All other hosts get the same browser-shaped headers.
 */
export function browserHeadersFor(url: string): Record<string, string> {
  const base: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    Accept:
      "image/avif,image/webp,image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5",
  }
  if (url.includes("bhphotovideo.com")) {
    base["Referer"] = "https://www.bhphotovideo.com/"
  }
  return base
}

/**
 * The Content-Type guard: refuse non-image responses (some servers
 * serve HTML 200 pages when they don't have the image — without this
 * we'd write the HTML to disk and confuse sharp later).
 */
export function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return false
  return contentType.trim().toLowerCase().startsWith("image/")
}
