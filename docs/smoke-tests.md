# Smoke tests

Manual checklist run **before tagging a release**. Covers what Vitest
intentionally doesn't (Electron lifecycle, the model, real network).

## Pre-flight (any platform)

```bash
npm install
npm run typecheck        # must be clean
npm run test:coverage    # gate must pass
npm run build            # all four bundles emit cleanly
```

## Sidecar smoke (no Electron)

The cheapest end-to-end verification — pipes JSONL into the bundled
worker without spinning up Electron. Validates: model loading, sharp,
onnxruntime, file I/O.

```bash
mkdir -p /tmp/bgremover-smoke
(
  echo '{"type":"init","modelDir":"'$HOME'/Library/Application Support/TPP Background Remover/models"}'
  echo '{"type":"job","id":"s1","kind":"file","input":"/tmp/bg-removal/raw/row_002.webp","output":"/tmp/bgremover-smoke/row_002.png"}'
  sleep 60
  echo '{"type":"shutdown"}'
) | node out/worker/index.js
```

**Expected output (newline-delimited JSON):**
```
{"type":"progress","id":"s1","phase":"loading"}
{"type":"progress","id":"s1","phase":"inferring"}
{"type":"ready"}
{"type":"progress","id":"s1","phase":"writing"}
{"type":"done","id":"s1","outputPath":"/tmp/bgremover-smoke/row_002.png","ms":<integer>}
```

**Expected file:** `/tmp/bgremover-smoke/row_002.png`, ~400 kB, PNG,
RGBA, matching the input resolution.

```bash
file /tmp/bgremover-smoke/row_002.png
# → PNG image data, 1200 x 1200, 8-bit/color RGBA, non-interlaced
```

## Electron preview smoke

Builds + launches the packaged renderer + main + worker without
producing an installer. Verifies the spawn glue between main and the
worker survives the packaged code paths.

```bash
npx electron-vite preview
```

**Expected:** window opens, model banner shows briefly (or stays
hidden if the cache is warm), no errors in the terminal beyond the
benign `Unknown model class "custom"` info line from transformers.

Quit with `Cmd+Q` (Mac) or `Alt+F4` (Win).

## Mode-by-mode (interactive)

Once the dev build is open (`npm run dev`):

### M3 — Folder mode

1. Tab **Folder**.
2. Source: pick `/tmp/bg-removal/raw/`.
3. Output: pick a fresh empty folder, e.g. `/tmp/bgremover-test-folder/`.
4. Click **Process folder**.

**Pass criteria:**
- Banner does not block the button after the first inference completes
  (model warmed up).
- Progress list scrolls with 90 entries, each ending in `✓ <seconds>s`.
- Summary reaches `90 / 90 processed (0 failed)`.
- Output folder has 90 PNGs with names matching the input minus extension.

### M4 — Excel / CSV local

1. Tab **Excel/CSV file**.
2. Choose `~/Downloads/SPORTSGRID BO SUBIDA.xlsx`.
3. Sheet dropdown → confirm "hoja 1" is auto-selected.
4. Column dropdown → pick `AK — image`.
5. Output: a fresh folder.
6. Click **Process column**.

**Pass criteria:**
- Summary reaches `90 / 90 processed` (or close — some URLs may 404
  upstream; ≥85/90 acceptable).
- Failed rows show the HTTP error in red.
- Output files named `row_001.png` … `row_090.png`.

### M5 — Spreadsheet URL

1. Prepare a public Google Sheet with a column of 5 image URLs.
   (Or use the rewrite manually — paste any `docs.google.com/spreadsheets/d/<ID>/edit`.)
2. Tab **Spreadsheet URL**.
3. Paste the URL → click **Load**.
4. Pick sheet + column → output folder.
5. Click **Process column**.

**Pass criteria:** 5 / 5 PNGs in the output folder.

### M6 — Cancel mid-batch

1. Start any batch ≥ 10 jobs.
2. Wait for 2–3 to complete, then click **Cancel batch**.
3. In-flight + queued jobs flip to `cancelled` (yellow).
4. Subsequent **Process** click — currently fails (the worker
   doesn't auto-respawn). Quit + relaunch the app to recover.
   *Known limitation, see [gotchas.md](./gotchas.md).*

### M6 — Model download flow

1. Quit the app.
2. Delete the model cache:
   ```bash
   rm -rf ~/Library/Application\ Support/TPP\ Background\ Remover/models/
   ```
3. Disconnect from the internet.
4. Launch the app. Try any batch.

**Pass criteria:** banner shows "Model not yet downloaded …", the
batch fails with a clear error. Reconnect to the internet, try again
— banner switches to "Downloading RMBG-1.4 weights…" with a progress
bar, then disappears once ready.

## Packaged installer smoke (per platform)

Run once per release on a clean machine (a VM is fine — no need for
real hardware).

### macOS

1. Copy `release/TPP Background Remover-0.1.0-arm64.dmg` to a Mac
   that has no Xcode tools, no Node installed.
2. Double-click → drag to Applications.
3. First open: right-click the app icon → **Open**. Dismiss Gatekeeper.
4. Run the M3 smoke test inside the packaged app.

### Windows

1. Copy `release/TPP Background Remover Setup 0.1.0.exe` to a Windows
   VM.
2. Run → SmartScreen → **More info** → **Run anyway**.
3. NSIS installer → install to per-user location.
4. Run the M3 smoke test inside the packaged app.

**Release ready when:** both M3 smoke tests on packaged builds pass
on machines without Node or build tools.
