# Testing

> Unit tests for pure logic + filesystem helpers. Electron lifecycle,
> the renderer (React UI), the model, the native sidecar binary, and
> the GPU/CPU ONNX runtime are **not** covered by Vitest — they're
> exercised by the manual smoke-test checklist in
> [smoke-tests.md](./smoke-tests.md).

## Stack

| Piece | Choice | Notes |
|---|---|---|
| Runner | [Vitest 3](https://vitest.dev/) | ESM-native, fast, plays well with Vite's TS resolver |
| Path alias | `@shared/*` → `src/shared/*` (vitest.config.ts → `resolve.alias`) | Same alias as the production bundles |
| Environment | `node` | Switch per-test to `jsdom` once we add component tests |
| Timezone | `TZ=UTC` (set in `package.json` scripts) | Locks `Date.getFullYear` / `toLocaleDateString` for reproducible Intl output |
| Coverage | v8 (`@vitest/coverage-v8`) | Per-file gate, not project-wide — see below |

## Scripts

```bash
npm test              # one-shot — TZ=UTC vitest run
npm run test:watch    # interactive watch mode
npm run test:coverage # one-shot + coverage report + threshold gate
```

## Conventions

- Tests colocate with source: `foo.ts` → `foo.test.ts` in the same directory.
- Include pattern is `src/**/*.test.ts` / `src/**/*.test.tsx` (see
  [`vitest.config.ts`](../vitest.config.ts)).
- Import from Vitest explicitly (`import { describe, expect, it } from "vitest"`).
  `globals` is off to keep import trees honest.
- One `describe` block per exported symbol; one `it` per logical branch.
  Boundary cases (inclusive thresholds, just-below-threshold) get their
  own `it`.
- **Pure functions, real filesystem, or real local libraries only.**
  Anything that reaches for the network, Electron APIs, or the model
  either gets the pure core extracted (the pattern we used for
  `url-rewrite.ts`) or sits in the smoke-test column.
- No mocks. If you need to mock, you're testing the wrong layer.
- File-touching tests (`spreadsheet.test.ts`) write to `os.tmpdir()` in
  `beforeAll` and tear down in `afterAll`. They don't pollute the repo.

## What is covered today

| Layer | Module | Targets |
|---|---|---|
| **Primitives** | [`src/shared/jsonl.ts`](../src/shared/jsonl.ts) | `createJsonlBuffer().feed()` / `.flush()` — line-framing, partial lines, CRLF, empty lines, chunk boundaries inside JSON objects |
| **Primitives** | [`src/main/input-resolver.ts`](../src/main/input-resolver.ts) — pure helpers | `columnLetter(idx)` (1↔A, 26↔Z, 27↔AA, 37↔AK, 702↔ZZ, 703↔AAA), `letterToColumn` (round-trips 1..750), `rewriteGoogleSheetsUrl` (edit / pub / direct .xlsx / Drive folder passthrough / empty string), `looksLikeUrl` (http+https, case, file:// rejected, embedded http rejected) |
| **Spreadsheet I/O** | `src/main/input-resolver.ts` — `readSpreadsheetMeta` / `extractColumnUrls` | CSV + XLSX, multi-sheet, rich-text headers, hyperlink cells, numeric cells, empty cells, missing-sheet error path, column AK matching the SPORTSGRID layout |
| **URL gotchas** | [`src/worker/url-rewrite.ts`](../src/worker/url-rewrite.ts) | `rewriteImageUrl`: Google Drive viewer rewrite (with + without query string, http + https, Drive folder passthrough), B&H cdn-cgi wrapper extraction (various params), scene7 + plain passthroughs, empty string. `browserHeadersFor`: UA + Accept presence, B&H Referer added, no Referer for non-B&H. `isImageContentType`: image/* true (JPEG/PNG/WEBP/SVG), case-insensitive, charset params, whitespace, HTML / application/* / null / empty rejected |

## Coverage policy

Gate is enforced **only on the files listed in `coverage.include`** in
[`vitest.config.ts`](../vitest.config.ts):

```ts
include: [
  "src/shared/jsonl.ts",
  "src/main/input-resolver.ts",
  "src/worker/url-rewrite.ts",
]
```

Threshold:

| Metric | Floor |
|---|---|
| Lines | 80% |
| Statements | 80% |
| Functions | 80% |
| Branches | 75% |

Current report (run `npm run test:coverage` to refresh):

| File | Lines | Statements | Functions | Branches |
|---|---|---|---|---|
| `src/shared/jsonl.ts` | 100% | 100% | 100% | 100% |
| `src/worker/url-rewrite.ts` | 100% | 100% | 100% | 100% |
| `src/main/input-resolver.ts` | 86.45% | 86.45% | 88.88% | 77.77% |
| **Total** | **89.85%** | **89.85%** | **93.33%** | **83.87%** |

## What's **not** covered (deliberately)

| Module | Why excluded | How it's verified |
|---|---|---|
| `src/main/index.ts` | Electron lifecycle — needs a real Electron runtime | `npx electron-vite preview` smoke test |
| `src/main/ipc.ts` | IPC handlers — need a `BrowserWindow` and the worker | Manual smoke test (folder mode end-to-end) |
| `src/main/worker-bridge.ts` | Spawns native binaries; FS-side effects | Smoke-tested by piping JSONL into `node out/worker/index.js` directly — see `docs/smoke-tests.md` |
| `src/main/model-manager.ts` | Reads the HF cache layout from a real on-disk model | Verified by deleting the cache + checking the banner flow |
| `src/worker/index.ts` | Boots transformers + sharp + onnxruntime | Same smoke test |
| `src/worker/background-removal.ts` | RMBG model + ONNX inference | Smoke test produces a 1200×1200 RGBA PNG from `/tmp/bg-removal/raw/row_002.webp` in ~20 s |
| `src/worker/fetch-image.ts` | Real network calls | Pure core (`url-rewrite.ts`) is 100% covered; the network plumbing is verified by the SPORTSGRID URL set |
| `src/renderer/**` | React UI + Electron IPC + Tailwind | Manual smoke checklist; future addition once we add jsdom + RTL |

When adding new code:

1. **If it's pure logic** → write a test alongside, add the file to
   `coverage.include`, push the gate up.
2. **If it has FS access but no external services** → write a test
   that uses `os.tmpdir()` for fixtures.
3. **If it needs Electron / the model / the network** → extract the
   pure core and test that. Document the remaining "wet" surface in
   [smoke-tests.md](./smoke-tests.md).
