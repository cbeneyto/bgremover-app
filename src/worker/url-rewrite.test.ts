import { describe, expect, it } from "vitest"

import {
  browserHeadersFor,
  isImageContentType,
  rewriteImageUrl,
} from "./url-rewrite"

describe("rewriteImageUrl — Google Drive viewer URLs", () => {
  it("rewrites a standard /file/d/<ID>/view URL to the direct download endpoint", () => {
    const url =
      "https://drive.google.com/file/d/1AbC2_dEFg-hIJk/view?usp=sharing"
    expect(rewriteImageUrl(url)).toBe(
      "https://drive.usercontent.google.com/download?id=1AbC2_dEFg-hIJk&export=download&authuser=0",
    )
  })

  it("rewrites the viewer URL even when no query string is present", () => {
    const url = "https://drive.google.com/file/d/XYZ/view"
    expect(rewriteImageUrl(url)).toBe(
      "https://drive.usercontent.google.com/download?id=XYZ&export=download&authuser=0",
    )
  })

  it("does not rewrite a Drive URL that doesn't match the viewer pattern", () => {
    const url = "https://drive.google.com/drive/folders/abcdef"
    expect(rewriteImageUrl(url)).toBe(url)
  })

  it("works over http as well as https", () => {
    expect(rewriteImageUrl("http://drive.google.com/file/d/PLAIN/view")).toBe(
      "https://drive.usercontent.google.com/download?id=PLAIN&export=download&authuser=0",
    )
  })
})

describe("rewriteImageUrl — B&H Photo cdn-cgi wrapper", () => {
  it("strips the cdn-cgi/image/<params>/ prefix and returns the inner URL", () => {
    const url =
      "https://www.bhphotovideo.com/cdn-cgi/image/fit=scale-down,width=500,quality=95/https://www.bhphotovideo.com/images/images500x500/foo.jpg"
    expect(rewriteImageUrl(url)).toBe(
      "https://www.bhphotovideo.com/images/images500x500/foo.jpg",
    )
  })

  it("handles different cdn-cgi param strings (only one slash before the inner URL)", () => {
    const url =
      "https://www.bhphotovideo.com/cdn-cgi/image/format=auto/https://www.bhphotovideo.com/images/x.png"
    expect(rewriteImageUrl(url)).toBe(
      "https://www.bhphotovideo.com/images/x.png",
    )
  })

  it("does not rewrite a B&H direct image URL", () => {
    const url = "https://www.bhphotovideo.com/images/images500x500/foo.jpg"
    expect(rewriteImageUrl(url)).toBe(url)
  })
})

describe("rewriteImageUrl — passthroughs", () => {
  it("returns plain image URLs unchanged", () => {
    const url = "https://example.com/image.jpg"
    expect(rewriteImageUrl(url)).toBe(url)
  })

  it("returns scene7 CDN URLs unchanged (Target's CDN)", () => {
    const url =
      "https://target.scene7.com/is/image/Target/GUEST_a1b2c3?wid=1000&hei=1000"
    expect(rewriteImageUrl(url)).toBe(url)
  })

  it("does not crash on the empty string", () => {
    expect(rewriteImageUrl("")).toBe("")
  })
})

describe("browserHeadersFor", () => {
  it("returns a User-Agent and image-friendly Accept", () => {
    const h = browserHeadersFor("https://example.com/x.jpg")
    expect(h["User-Agent"]).toMatch(/Mozilla.*Chrome/)
    expect(h["Accept"]).toContain("image/")
  })

  it("adds a Referer for B&H requests", () => {
    const h = browserHeadersFor("https://www.bhphotovideo.com/images/x.jpg")
    expect(h["Referer"]).toBe("https://www.bhphotovideo.com/")
  })

  it("does not add a Referer for non-B&H requests", () => {
    const h = browserHeadersFor("https://example.com/x.jpg")
    expect("Referer" in h).toBe(false)
  })
})

describe("isImageContentType", () => {
  it("returns true for common image MIMEs", () => {
    expect(isImageContentType("image/jpeg")).toBe(true)
    expect(isImageContentType("image/png")).toBe(true)
    expect(isImageContentType("image/webp")).toBe(true)
    expect(isImageContentType("image/svg+xml")).toBe(true)
  })

  it("returns true with charset and other params", () => {
    expect(isImageContentType("image/jpeg; charset=binary")).toBe(true)
  })

  it("is case-insensitive", () => {
    expect(isImageContentType("Image/JPEG")).toBe(true)
  })

  it("trims surrounding whitespace", () => {
    expect(isImageContentType("  image/png  ")).toBe(true)
  })

  it("returns false for null", () => {
    expect(isImageContentType(null)).toBe(false)
  })

  it("returns false for an empty string", () => {
    expect(isImageContentType("")).toBe(false)
  })

  it("returns false for HTML — the main gotcha we're guarding against", () => {
    expect(isImageContentType("text/html; charset=utf-8")).toBe(false)
  })

  it("returns false for an application MIME (PDF, octet-stream, etc.)", () => {
    expect(isImageContentType("application/octet-stream")).toBe(false)
    expect(isImageContentType("application/pdf")).toBe(false)
  })
})
