/**
 * Integration-ish tests for the spreadsheet reader. These touch the
 * filesystem and the `exceljs` / `papaparse` libraries — i.e. they
 * read real fixture files. Still considered "unit" here because they
 * don't spin up Electron, the worker, or the network.
 */

import ExcelJS from "exceljs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { extractColumnUrls, readSpreadsheetMeta } from "./input-resolver"

let tmp = ""
let csvPath = ""
let xlsxPath = ""

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "bgremover-spreadsheet-test-"))

  // CSV fixture — 3 columns, 3 data rows, with one non-URL noise
  // value to ensure looksLikeUrl filters it out.
  csvPath = join(tmp, "fixture.csv")
  await writeFile(
    csvPath,
    [
      "name,sku,image",
      "Foo,sku-1,https://example.com/a.jpg",
      "Bar,sku-2,not-a-url",
      "Baz,sku-3,http://example.com/c.png",
    ].join("\n"),
    "utf8",
  )

  // XLSX fixture — two sheets, one with a header row and a few URLs
  // in column AK (replicating the SPORTSGRID layout in miniature).
  xlsxPath = join(tmp, "fixture.xlsx")
  const wb = new ExcelJS.Workbook()
  const s1 = wb.addWorksheet("hoja 1")
  // Pad to column AK (37). Headers in row 1.
  const headers: string[] = []
  for (let i = 1; i <= 37; i++) headers.push(i === 37 ? "image" : `col${i}`)
  s1.addRow(headers)
  s1.addRow([
    ...Array.from({ length: 36 }, (_, i) => `r2-c${i + 1}`),
    "https://example.com/r2.jpg",
  ])
  s1.addRow([
    ...Array.from({ length: 36 }, (_, i) => `r3-c${i + 1}`),
    "https://example.com/r3.jpg",
  ])
  s1.addRow([...Array.from({ length: 36 }, () => ""), "  "]) // empty URL row
  s1.addRow([
    ...Array.from({ length: 36 }, (_, i) => `r5-c${i + 1}`),
    "not-a-url",
  ])

  const s2 = wb.addWorksheet("otra")
  s2.addRow(["a", "b"])
  s2.addRow(["x", "y"])

  // Third sheet exercises the trickier cell types we have to read
  // through: rich-text headers, hyperlink cells, formula cells, and
  // numeric cells (which our reader coerces with String()).
  const s3 = wb.addWorksheet("tricky")
  const headerRow = s3.addRow([null, null])
  // ExcelJS rich-text header: a styled cell whose value is an array
  // of text runs. Our reader has to concatenate the .text fields.
  headerRow.getCell(1).value = {
    richText: [
      { text: "image " },
      { text: "URL" },
    ],
  } as unknown as ExcelJS.CellValue
  headerRow.getCell(2).value = "qty"
  s3.addRow([
    {
      text: "https://example.com/hyper.jpg",
      hyperlink: "https://example.com/hyper.jpg",
    } as unknown as ExcelJS.CellValue,
    42, // numeric — must not crash the reader, must be filtered out by looksLikeUrl
  ])
  s3.addRow([
    "https://example.com/plain.jpg",
    "noise",
  ])

  await wb.xlsx.writeFile(xlsxPath)
})

afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true })
})

describe("readSpreadsheetMeta — CSV", () => {
  it("reports a single 'sheet' sheet with headers in column-letter form", async () => {
    const meta = await readSpreadsheetMeta(csvPath)
    expect(meta.sheets).toEqual(["sheet"])
    expect(meta.headersBySheet["sheet"]).toEqual([
      { letter: "A", header: "name" },
      { letter: "B", header: "sku" },
      { letter: "C", header: "image" },
    ])
  })
})

describe("extractColumnUrls — CSV", () => {
  it("returns only http(s) URLs from the chosen column, skipping non-URLs", async () => {
    const urls = await extractColumnUrls({
      filePath: csvPath,
      sheetName: "sheet",
      columnLetter: "C",
    })
    expect(urls).toEqual([
      "https://example.com/a.jpg",
      "http://example.com/c.png",
    ])
  })

  it("returns [] for a column that has no URLs at all", async () => {
    const urls = await extractColumnUrls({
      filePath: csvPath,
      sheetName: "sheet",
      columnLetter: "A",
    })
    expect(urls).toEqual([])
  })
})

describe("readSpreadsheetMeta — XLSX", () => {
  it("lists every sheet name", async () => {
    const meta = await readSpreadsheetMeta(xlsxPath)
    expect(meta.sheets).toEqual(["hoja 1", "otra", "tricky"])
  })

  it("returns headers for the SPORTSGRID-like layout (column AK header = 'image')", async () => {
    const meta = await readSpreadsheetMeta(xlsxPath)
    const headers = meta.headersBySheet["hoja 1"]
    expect(headers).toBeDefined()
    expect(headers.length).toBe(37)
    expect(headers[headers.length - 1]).toEqual({ letter: "AK", header: "image" })
  })
})

describe("extractColumnUrls — XLSX", () => {
  it("returns the URLs from column AK and skips empty + non-URL rows", async () => {
    const urls = await extractColumnUrls({
      filePath: xlsxPath,
      sheetName: "hoja 1",
      columnLetter: "AK",
    })
    expect(urls).toEqual([
      "https://example.com/r2.jpg",
      "https://example.com/r3.jpg",
    ])
  })

  it("throws a friendly error when the sheet name is wrong", async () => {
    await expect(
      extractColumnUrls({
        filePath: xlsxPath,
        sheetName: "nope",
        columnLetter: "AK",
      }),
    ).rejects.toThrow(/Sheet not found/)
  })

  it("returns [] when the column exists but has no URLs", async () => {
    const urls = await extractColumnUrls({
      filePath: xlsxPath,
      sheetName: "otra",
      columnLetter: "A",
    })
    expect(urls).toEqual([])
  })

  it("reads hyperlink cells via the .hyperlink field (not the display text)", async () => {
    const urls = await extractColumnUrls({
      filePath: xlsxPath,
      sheetName: "tricky",
      columnLetter: "A",
    })
    expect(urls).toEqual([
      "https://example.com/hyper.jpg",
      "https://example.com/plain.jpg",
    ])
  })

  it("does not include numeric cells (coerced via String()) when they aren't URLs", async () => {
    const urls = await extractColumnUrls({
      filePath: xlsxPath,
      sheetName: "tricky",
      columnLetter: "B",
    })
    expect(urls).toEqual([])
  })
})

describe("readSpreadsheetMeta — rich-text headers", () => {
  it("concatenates rich-text runs into a single header string", async () => {
    const meta = await readSpreadsheetMeta(xlsxPath)
    const tricky = meta.headersBySheet["tricky"]
    expect(tricky).toBeDefined()
    expect(tricky[0]).toEqual({ letter: "A", header: "image URL" })
    expect(tricky[1]).toEqual({ letter: "B", header: "qty" })
  })
})
