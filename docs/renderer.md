# Renderer (React) layout and state

Single-page React 19 app. No routing — every input mode lives on the
same screen, behind a tab selector. Owns three pieces of state that
matter:

1. **Which input mode is active** (`folder` / `spreadsheet-local` / `spreadsheet-url`).
2. **The picks for that mode** (folder path, spreadsheet meta, chosen
   sheet + column, URL string).
3. **The output folder.**

Everything else (job list, batch summary, model status) flows in as
streamed events from main via the hooks below.

## File layout

```
src/renderer/
├── main.tsx               ← createRoot, mounts <App />
├── App.tsx                ← top-level container, owns input state
├── components/
│   ├── InputModeTabs.tsx  ← 3 tabs (folder / xlsx-csv / url)
│   ├── PathPicker.tsx     ← reusable "choose a path" row
│   ├── ColumnSelector.tsx ← sheet + column dropdowns
│   ├── ProgressList.tsx   ← per-job list + progress bar + summary
│   └── ModelDownloadBanner.tsx ← yellow banner on top while model is downloading
├── hooks/
│   ├── useModelStatus.ts  ← subscribes to model:status events
│   └── useJobs.ts         ← subscribes to job:state + batch:summary
└── styles/globals.css     ← Tailwind base + custom scrollbar + drag region
```

## Hooks

### `useModelStatus()`

Returns the current `ModelStatus` from main. On mount it:

1. Calls `window.api.getModelStatus()` for the initial snapshot.
2. Subscribes via `window.api.onModelStatus(...)` for live updates.
3. Cleans up the listener on unmount.

The state machine is `checking → missing → downloading → ready` (or
`error`). The download progress is approximate — bytes / total — based
on watching the model directory size and the worker's
`model-download` events.

### `useJobs()`

Returns `{ jobs, summary, clear }`.

- `jobs: JobState[]` — every job currently or recently in flight.
  Updated reactively by `job:state` events from main; preserves
  insertion order so the UI reads top-to-bottom in batch order.
- `summary: BatchSummary` — `{total, done, failed}`. Drives the
  progress bar.
- `clear()` — resets both. Called at the start of every new batch
  in [`App.tsx`](../src/renderer/App.tsx) `run()`.

## Renderer ↔ main contract

The renderer only ever touches `window.api`. The full surface is
typed in [`src/shared/protocol.ts`](../src/shared/protocol.ts) and
listed in [ipc-protocol.md](./ipc-protocol.md). The renderer **never**:

- imports `electron`, `fs`, `child_process`, or any Node API
- imports `exceljs`, `papaparse`, or any image library
- talks to the worker directly
- knows where the model lives on disk

This makes it trivially swappable — if we ever ship a web preview, the
renderer is the only piece that comes along.

## Styling

Tailwind 3.4 with a small custom palette (`tailwind.config.ts`):

| Token | Use |
|---|---|
| `bg`, `bg-panel`, `bg-subtle` | three layers of dark backgrounds |
| `fg`, `fg-muted`, `fg-subtle` | text hierarchy |
| `accent`, `accent-hover` | primary buttons, progress bar |
| `success`, `warning`, `danger` | job status dots, banners |

The macOS title bar uses `titleBarStyle: "hiddenInset"` so the
gradient header doubles as a drag region. `.drag-region` /
`.no-drag` classes opt-in / opt-out (defined in `globals.css`).

## Form validation philosophy

Light-touch. The "Process" button is `disabled` until the minimum
required state is satisfied (`canRun` memo in `App.tsx`). We don't
validate URLs in the renderer — the worker's HTTP error path is
clearer and we'd duplicate the regex.

The one renderer-side check we do: pre-flight the folder listing /
column extraction before sending jobs, so empty inputs surface as
"No raster images found …" / "That column has no http(s) URLs."
rather than a silent "0/0" batch.
