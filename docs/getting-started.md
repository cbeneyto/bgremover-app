# Getting started

## Prerequisites

- Node **≥ 20.x** (the worker is bundled as CJS, target `node20`)
- npm **≥ 10.x** (lockfile is npm-flavoured)
- macOS 12+ for `.dmg` builds, Windows 10+ for `.exe` builds
- Building `.exe` on macOS: install `wine-stable` via Homebrew (only needed for the NSIS step)

The app itself has **no** Node-on-the-end-user dependency — the packaged
build ships its own Node binary under `Resources/node-bin/`.

## First-time setup

```bash
git clone <repo>
cd bgremover
npm install
```

The first inference downloads the RMBG-1.4 weights (~180 MB) to:

- macOS: `~/Library/Application Support/TPP Background Remover/models/`
- Windows: `%APPDATA%/TPP Background Remover/models/`

After that the app is fully offline. The model cache is shared across
dev runs and the packaged app (both point at the same `userData/models`).

## Day-to-day scripts

| Script | What it does | When to use |
|---|---|---|
| `npm run dev` | Builds the worker once, then runs `electron-vite dev` (renderer HMR, main hot reload) | Interactive UI work |
| `npm run build` | Builds main + preload + renderer + worker to `out/` | Verifying a clean production build |
| `npm run build:worker` | Builds **only** `out/worker/index.js` | After editing `src/worker/*` while `npm run dev` is running |
| `npm test` | Runs the Vitest suite (`TZ=UTC`) | Locally, in CI |
| `npm run test:watch` | Vitest in interactive watch mode | While writing tests |
| `npm run test:coverage` | Vitest + v8 coverage with the configured threshold | Pre-commit / CI gate |
| `npm run typecheck` | Runs `tsc --noEmit` for both Node and web tsconfigs | Pre-commit / CI gate |
| `npm run fetch-node` | Downloads Node 20.18.1 binaries for sidecar (idempotent). Auto-runs as part of `pack:*` | Standalone if you want to pre-warm the cache |
| `npm run prepare:cross-deps` | Installs `@img/sharp-*` native bins for every target OS into `node_modules` (idempotent). Auto-runs as part of `pack:*` | Standalone if you want to sanity-check the install before packing |
| `npm run icons` | Generates `resources/icon.png` (+ `icon.icns` on macOS) from `resources/icon.svg` | After editing the brand mark |
| `npm run pack:mac` | `build` + `electron-builder --mac --arm64` → `release/*.dmg` | Release |
| `npm run pack:win` | `build` + `electron-builder --win --x64` → `release/*.exe` | Release |

## Test data locations

These come from the validation run documented in the source plan
(`~/Desktop/plan-bgremover-electron.md`, section 0):

- `/tmp/bg-removal/raw/` — 90 mixed `.jpg/.png/.webp` files. Drag this
  into the **Folder** mode to validate M3.
- `/tmp/bg-removal/clean/` — the expected output (90 transparent PNGs).
  Compare against your output folder.
- `~/Downloads/SPORTSGRID BO SUBIDA.xlsx` — sheet `hoja 1`, column **AK**.
  The success criterion for M4 (Excel local mode) is **90/90 PNGs**.

If `/tmp/bg-removal/` is empty (after a reboot), the zips next to it
(`raw.zip`, `clean.zip`) get you back to the same state.

## Troubleshooting

- **"Worker not running" error in the UI** → `out/worker/index.js` doesn't
  exist. Run `npm run build:worker`.
- **Window opens but model never downloads** → check stderr in the terminal
  running `npm run dev`. The worker forwards `@huggingface/transformers`
  progress as `[worker] ...` lines.
- **Coverage gate fails locally but passes in CI** → make sure you ran
  `TZ=UTC npm run test:coverage`. Without `TZ=UTC`, date-locale tests
  drift. (The npm script sets it for you.)
- **`postcss.config.js` warning about module type** → already fixed by
  using `module.exports`; if it returns, don't add `"type": "module"`
  to `package.json` — that breaks the electron-vite CJS expectations.
