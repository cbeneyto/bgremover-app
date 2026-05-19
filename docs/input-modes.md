# Input modes

Three input modes, sharing the same processing pipeline. Selection is
exclusive (radio-style tabs); switching tabs preserves each tab's
state so a half-configured Excel input survives a peek at the URL
tab.

## 1. Folder

**Pick a folder of images on disk.** Used for the simplest case — you
already downloaded the images, you just want backgrounds removed.

### Flow

1. User picks a source folder via `pickFolder()`.
2. User picks an output folder via `pickSaveFolder()`.
3. On Process, the renderer calls `listFolderImages(sourceDir)` to
   get the file list. Main filters to `.jpg/.jpeg/.png/.webp` and
   sorts alphabetically.
4. Each file becomes a `{kind:"file", input, output}` job. Output
   name is `<baseName>.png` in the destination folder.

### Validation criterion (M3)

`/tmp/bg-removal/raw/` (90 images, mixed formats) → 90 PNGs in the
output folder. Compare byte-for-byte against `/tmp/bg-removal/clean/`
— pixel values should match (the model is deterministic on a fixed
input + provider).

## 2. Excel / CSV local

**Pick a spreadsheet on disk; choose a sheet + a column.** The chosen
column should contain image URLs.

### Supported file types

- `.xlsx` — via [`exceljs`](https://github.com/exceljs/exceljs).
- `.csv` — via [`papaparse`](https://www.papaparse.com/).
- `.tsv` — same parser as CSV, with `\t` delimiter.

### Flow

1. User picks the file → `readSpreadsheetLocal(filePath)`.
2. Main parses the file with the appropriate library and returns
   `SpreadsheetMeta`:
   ```ts
   {
     filePath,
     sheets: ["hoja 1", ...],
     headersBySheet: {
       "hoja 1": [
         { letter: "A", header: "id" },
         { letter: "AK", header: "image" },
         ...
       ],
       ...
     }
   }
   ```
3. Renderer shows dropdowns for sheet (defaults to first) and column
   (no default — user must pick).
4. On Process: renderer calls `extractColumnUrls({filePath, sheetName, columnLetter})`.
   Main reads the file again and returns the http(s) URLs from that
   column, in row order, skipping empties and non-URLs.
5. Each URL becomes a `{kind:"url", url, output}` job. Output name is
   `row_<NNN>.png` with zero-padded index, preserving spreadsheet
   order so it's trivial to reconcile back against the source.

### Cell-type handling (XLSX)

`exceljs` returns different shapes depending on the cell:

- Plain string → `cell.value: string`
- Hyperlink → `cell.value: { text: "...", hyperlink: "https://..." }`
- Rich text → `cell.value: { richText: [{ text: "..." }, ...] }`
- Number → `cell.value: number`
- Empty → `cell.value: null`

`extractColumnUrls()` handles all five and prefers `.hyperlink` over
`.text` when both are present. Locked by tests in
[`spreadsheet.test.ts`](../src/main/spreadsheet.test.ts).

### Validation criterion (M4)

`~/Downloads/SPORTSGRID BO SUBIDA.xlsx`, sheet `hoja 1`, column **AK**
(header literal: `image`). 90 URLs. Success = 90 PNGs.

## 3. Spreadsheet URL

**Paste a URL to a public spreadsheet.** Same as mode 2, but the file
is downloaded first.

### Flow

1. User pastes a URL into the text input → clicks "Load".
2. Renderer calls `readSpreadsheetUrl(url)`.
3. Main:
   a. Rewrites Google Sheets URLs (`docs.google.com/spreadsheets/d/<ID>/...`)
      to the xlsx export endpoint (`.../export?format=xlsx`). See
      `rewriteGoogleSheetsUrl()` in
      [`input-resolver.ts`](../src/main/input-resolver.ts).
   b. Downloads with browser-shaped headers to a temp directory.
   c. Parses via the same path as mode 2.
4. From here, identical to mode 2.

### Supported URL flavours

- Google Sheets editor: `https://docs.google.com/spreadsheets/d/<ID>/edit` → rewritten to xlsx export.
- Google Sheets pubhtml: `https://docs.google.com/spreadsheets/d/<ID>/pubhtml` → rewritten.
- Direct `.xlsx` link: `https://example.com/data.xlsx` → fetched as-is.
- Direct `.csv` link: `https://example.com/data.csv` → fetched as-is, parsed as CSV.

URLs that don't match any of the above are tried as-is — if the
content-type comes back HTML the parse will fail and surface the
error to the renderer.

### Validation criterion (M5)

A public Google Sheet with a column of 5 image URLs → 5 PNGs. End-to-end
proof that the rewrite + download + parse pipeline composes.
