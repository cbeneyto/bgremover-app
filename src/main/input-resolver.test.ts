import { describe, expect, it } from "vitest"

import {
  columnLetter,
  letterToColumn,
  looksLikeUrl,
  rewriteGoogleSheetsUrl,
} from "./input-resolver"

describe("columnLetter", () => {
  it("maps 1 → A", () => {
    expect(columnLetter(1)).toBe("A")
  })

  it("maps 26 → Z (last single-letter column)", () => {
    expect(columnLetter(26)).toBe("Z")
  })

  it("maps 27 → AA (first two-letter column)", () => {
    expect(columnLetter(27)).toBe("AA")
  })

  it("maps the SPORTSGRID column AK back through the round-trip", () => {
    // AK is the column of interest in the validation set; lock the
    // mapping so the renderer's dropdown matches the spreadsheet.
    expect(columnLetter(37)).toBe("AK")
  })

  it("maps 702 → ZZ (last two-letter column)", () => {
    expect(columnLetter(702)).toBe("ZZ")
  })

  it("maps 703 → AAA (first three-letter column)", () => {
    expect(columnLetter(703)).toBe("AAA")
  })
})

describe("letterToColumn", () => {
  it("inverts columnLetter for single-letter columns", () => {
    expect(letterToColumn("A")).toBe(1)
    expect(letterToColumn("Z")).toBe(26)
  })

  it("inverts columnLetter for two-letter columns", () => {
    expect(letterToColumn("AA")).toBe(27)
    expect(letterToColumn("AK")).toBe(37)
    expect(letterToColumn("ZZ")).toBe(702)
  })

  it("is case-insensitive", () => {
    expect(letterToColumn("ak")).toBe(37)
    expect(letterToColumn("aK")).toBe(37)
  })

  it("round-trips with columnLetter across a wide range", () => {
    for (let i = 1; i <= 750; i++) {
      expect(letterToColumn(columnLetter(i))).toBe(i)
    }
  })
})

describe("rewriteGoogleSheetsUrl", () => {
  it("rewrites a /d/<ID>/edit URL to the xlsx export endpoint", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1abc_DEF-2/edit#gid=0"
    expect(rewriteGoogleSheetsUrl(url)).toBe(
      "https://docs.google.com/spreadsheets/d/1abc_DEF-2/export?format=xlsx",
    )
  })

  it("rewrites a bare /d/<ID> URL", () => {
    const url = "https://docs.google.com/spreadsheets/d/XYZ"
    expect(rewriteGoogleSheetsUrl(url)).toBe(
      "https://docs.google.com/spreadsheets/d/XYZ/export?format=xlsx",
    )
  })

  it("rewrites the /pub URL flavour the same way", () => {
    const url = "https://docs.google.com/spreadsheets/d/ID2/pubhtml"
    expect(rewriteGoogleSheetsUrl(url)).toBe(
      "https://docs.google.com/spreadsheets/d/ID2/export?format=xlsx",
    )
  })

  it("leaves direct .xlsx URLs untouched", () => {
    const url = "https://example.com/sheet.xlsx"
    expect(rewriteGoogleSheetsUrl(url)).toBe(url)
  })

  it("leaves Drive folder URLs untouched", () => {
    // Drive folders aren't sheets and have no export endpoint — let
    // the caller's fetch fail loudly instead of silently rewriting.
    const url = "https://drive.google.com/drive/folders/abc"
    expect(rewriteGoogleSheetsUrl(url)).toBe(url)
  })

  it("does not crash on the empty string", () => {
    expect(rewriteGoogleSheetsUrl("")).toBe("")
  })
})

describe("looksLikeUrl", () => {
  it("returns true for http URLs", () => {
    expect(looksLikeUrl("http://example.com/x.jpg")).toBe(true)
  })

  it("returns true for https URLs", () => {
    expect(looksLikeUrl("https://example.com/x.jpg")).toBe(true)
  })

  it("is case-insensitive on the scheme", () => {
    expect(looksLikeUrl("HTTPS://EXAMPLE.COM")).toBe(true)
  })

  it("returns false for empty strings", () => {
    expect(looksLikeUrl("")).toBe(false)
  })

  it("returns false for relative paths", () => {
    expect(looksLikeUrl("/images/foo.jpg")).toBe(false)
  })

  it("returns false for file:// URLs (we only ship over http/s in the URL modes)", () => {
    expect(looksLikeUrl("file:///tmp/x.jpg")).toBe(false)
  })

  it("returns false for non-URL text that contains 'http' but doesn't start with it", () => {
    expect(looksLikeUrl("see http://example.com")).toBe(false)
  })
})
