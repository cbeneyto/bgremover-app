# TPP Background Remover — Documentation Index

Entry point for all project docs. If you're an agent starting a task,
read this first and jump to the relevant canonical file. **Every
functional change must update the matching canonical doc in the same
commit.**

## Canonical docs

| Topic | File |
|---|---|
| Stack, three-process layout, data flow | [architecture.md](./architecture.md) |
| Dev setup, scripts, commands you'll actually run | [getting-started.md](./getting-started.md) |
| Renderer ↔ main IPC + worker JSONL protocol | [ipc-protocol.md](./ipc-protocol.md) |
| Worker internals: RMBG-1.4, sharp, URL gotchas | [worker.md](./worker.md) |
| Renderer (React) layout and state model | [renderer.md](./renderer.md) |
| Design system — palette, type, components, motion | [design.md](./design.md) |
| Settings drawer — Model / Processing / About | [settings.md](./settings.md) |
| Model cache, download, offline fallback | [model.md](./model.md) |
| Spreadsheet input modes (folder / Excel-CSV / URL) | [input-modes.md](./input-modes.md) |
| Vitest setup, what's covered, what isn't | [testing.md](./testing.md) |
| electron-builder config, dmg/nsis output, sidecar staging | [packaging.md](./packaging.md) |
| Manual smoke-test checklist (per release) | [smoke-tests.md](./smoke-tests.md) |
| Known gotchas and quick fixes | [gotchas.md](./gotchas.md) |

## Quick links

- Source plan: `~/Desktop/plan-bgremover-electron.md`
- Origin pipeline: [/Users/cbeneyto/dev/tpp-ops/src/lib/background-removal.ts](file:///Users/cbeneyto/dev/tpp-ops/src/lib/background-removal.ts) — **do not edit**, only copy
- Origin pipeline docs: [/Users/cbeneyto/dev/tpp-ops/docs/background-removal.md](file:///Users/cbeneyto/dev/tpp-ops/docs/background-removal.md)
- Validation dataset: `/tmp/bg-removal/raw/` (90 mixed jpg/png/webp) and `/tmp/bg-removal/clean/` (expected output)
- Validation Excel: `~/Downloads/SPORTSGRID BO SUBIDA.xlsx` (sheet "hoja 1", column AK)

## Conventions

- Test files colocate with source: `foo.ts` → `foo.test.ts`. Run `npm test` from the repo root.
- Coverage is **gated** on the files listed in [`vitest.config.ts`](../vitest.config.ts) `coverage.include`. Untested files are reported but not enforced. See [testing.md](./testing.md) for the rationale.
- Pure functions only in tests. Anything that needs Electron, the model, native binaries, or the network gets exercised by the manual smoke-test checklist in [smoke-tests.md](./smoke-tests.md).
- Comments at the top of every file in `src/` explain the *why*, not the *what*. Read those first.
