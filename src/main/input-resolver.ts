/**
 * Read spreadsheets (xlsx/csv) and resolve their structure into the
 * shape the renderer expects (sheets + headers per sheet, plus URL
 * extraction from a chosen column).
 *
 * Implementation notes:
 *  - We deliberately keep `exceljs` and `papaparse` confined to the
 *    main process. The renderer never parses anything raw — it only
 *    asks for metadata and final URL lists. This keeps the renderer
 *    sandbox honest and avoids shipping heavy parsers in the chromium
 *    bundle.
 *  - `papaparse` returns rows as arrays when `header: false`, which
 *    matches our column-letter UX (A, B, C, …) better than parsing
 *    by header name. The first non-empty row is treated as the header
 *    row.
 *  - Google Sheets URLs get rewritten to xlsx export endpoints before
 *    download (`docs.google.com/spreadsheets/d/<ID>/export?format=xlsx`).
 */

import ExcelJS from "exceljs"
import { readFile, writeFile, mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, extname } from "node:path"

import Papa from "papaparse"

import type { SpreadsheetMeta } from "../shared/protocol"

const GOOGLE_SHEETS_RE =
  /https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/

/** Convert a 1-based column index to letters (1 → A, 27 → AA). */
export function columnLetter(idx: number): string {
  let n = idx
  let s = ""
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Inverse of `columnLetter`. */
export function letterToColumn(letter: string): number {
  let n = 0
  for (const c of letter.toUpperCase()) {
    n = n * 26 + (c.charCodeAt(0) - 64)
  }
  return n
}

export function rewriteGoogleSheetsUrl(url: string): string {
  const m = url.match(GOOGLE_SHEETS_RE)
  if (!m) return url
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept:
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*;q=0.5",
}

export async function downloadSpreadsheetToTemp(
  url: string,
): Promise<string> {
  const finalUrl = rewriteGoogleSheetsUrl(url)
  const res = await fetch(finalUrl, { headers: BROWSER_HEADERS })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${finalUrl}`)
  }
  const ct = res.headers.get("content-type") ?? ""
  let ext = ".xlsx"
  if (ct.includes("csv") || finalUrl.toLowerCase().endsWith(".csv")) {
    ext = ".csv"
  }
  const dir = await mkdtemp(join(tmpdir(), "bgremover-sheet-"))
  const path = join(dir, `sheet${ext}`)
  const ab = await res.arrayBuffer()
  await writeFile(path, Buffer.from(ab))
  return path
}

export async function readSpreadsheetMeta(
  filePath: string,
): Promise<SpreadsheetMeta> {
  const ext = extname(filePath).toLowerCase()
  if (ext === ".csv" || ext === ".tsv") {
    return readCsvMeta(filePath, ext === ".tsv" ? "\t" : ",")
  }
  return readXlsxMeta(filePath)
}

async function readXlsxMeta(filePath: string): Promise<SpreadsheetMeta> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheets: string[] = []
  const headersBySheet: SpreadsheetMeta["headersBySheet"] = {}
  wb.eachSheet((sheet) => {
    sheets.push(sheet.name)
    const headerRow = sheet.getRow(1)
    const headers: { letter: string; header: string }[] = []
    const max = sheet.columnCount || headerRow.cellCount || 0
    for (let i = 1; i <= max; i++) {
      const cell = headerRow.getCell(i)
      const raw = cell?.value
      const text =
        raw == null
          ? ""
          : typeof raw === "object" && "richText" in raw
            ? (raw as { richText: { text: string }[] }).richText
                .map((p) => p.text)
                .join("")
            : String((raw as { text?: string }).text ?? raw)
      headers.push({ letter: columnLetter(i), header: text.trim() })
    }
    headersBySheet[sheet.name] = headers
  })
  return { filePath, sheets, headersBySheet }
}

async function readCsvMeta(
  filePath: string,
  delimiter: string,
): Promise<SpreadsheetMeta> {
  const text = await readFile(filePath, "utf8")
  const parsed = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: true,
  })
  const rows = parsed.data
  const firstRow = rows[0] ?? []
  const headers = firstRow.map((header, i) => ({
    letter: columnLetter(i + 1),
    header: (header ?? "").toString().trim(),
  }))
  const sheetName = "sheet"
  return {
    filePath,
    sheets: [sheetName],
    headersBySheet: { [sheetName]: headers },
  }
}

export async function extractColumnUrls(args: {
  filePath: string
  sheetName: string
  columnLetter: string
}): Promise<string[]> {
  const { filePath, sheetName, columnLetter: letter } = args
  const ext = extname(filePath).toLowerCase()
  const col = letterToColumn(letter)
  const out: string[] = []
  if (ext === ".csv" || ext === ".tsv") {
    const text = await readFile(filePath, "utf8")
    const parsed = Papa.parse<string[]>(text, {
      delimiter: ext === ".tsv" ? "\t" : ",",
      skipEmptyLines: true,
    })
    // Skip header row.
    for (let i = 1; i < parsed.data.length; i++) {
      const v = parsed.data[i]?.[col - 1]
      const s = (v ?? "").toString().trim()
      if (looksLikeUrl(s)) out.push(s)
    }
    return out
  }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const sheet = wb.getWorksheet(sheetName)
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`)
  for (let r = 2; r <= sheet.rowCount; r++) {
    const cell = sheet.getRow(r).getCell(col)
    const v = cell?.value
    let s = ""
    if (typeof v === "string") s = v
    else if (v && typeof v === "object" && "hyperlink" in v) {
      s = (v as { hyperlink: string }).hyperlink
    } else if (v && typeof v === "object" && "text" in v) {
      s = String((v as { text: string }).text)
    } else if (v != null) {
      s = String(v)
    }
    s = s.trim()
    if (looksLikeUrl(s)) out.push(s)
  }
  return out
}

export function looksLikeUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}
