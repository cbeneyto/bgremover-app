# Settings

Slide-in drawer triggered by the sliders icon in the title bar.
Three sections; everything persists in `localStorage` under the key
`bgremover.settings.v1`. Worker-affecting prefs are pushed over IPC
on every change, plus once on app start (see
[`src/renderer/hooks/useSettings.ts`](../src/renderer/hooks/useSettings.ts)).

State is held in a module-level store
([`src/shared/create-store.ts`](../src/shared/create-store.ts), 100 %
covered) so multiple `useSettings()` consumers stay in sync. The
naïve approach — each hook call gets its own `useState` — broke the
theme toggle: the drawer flipped its local state but `App.tsx`'s
`useTheme(settings.theme)` continued reading the old value, so the
`.dark` class on `<html>` never updated.

## Model

| Row | Source | Updates when |
|---|---|---|
| Repository | static (`briaai/RMBG-1.4`) | never |
| Status | `useModelStatus` hook | live (`model:status` events) |
| Local revision | `getLocalModelRevision()` reads `models--briaai--RMBG-1.4/refs/main` | after "Check for updates" runs |
| Disk usage | recursive size of the cache dir | when the drawer opens + when status changes |

Actions:

| Button | IPC | Behaviour |
|---|---|---|
| **Download model** / **Re-download** | `download-model` | Sends `warm-up` to worker, starts the disk-size polling so the banner shows progress. Same path used by the in-app banner. |
| **Clear cache** | `clear-model-cache` | Restarts the worker (so file handles are released), then recursively deletes the cache contents. Status flips to `missing`. Disabled when usage is 0. |
| **Open in Finder** | `open-model-cache-folder` | `shell.openPath(modelDir)`. Useful for debugging or manual clean-up. |
| **Check for updates** | `check-model-updates` | Hits `https://huggingface.co/api/models/briaai/RMBG-1.4/revision/main`, compares the returned SHA against the local revision. Fails closed — offline returns `upToDate: true` with `remoteRevision: null` so the UI doesn't nag. |

## Appearance

One control: **Theme** — a segmented control with three options
(System / Light / Dark). The choice persists to localStorage and is
applied to the DOM via the `useTheme` hook in
[`src/renderer/hooks/useTheme.ts`](../src/renderer/hooks/useTheme.ts):

- **System** — follows `prefers-color-scheme`. Also subscribes to the
  media-query so a sunset OS theme flip propagates without a relaunch.
- **Light / Dark** — explicit override. The OS theme is ignored.

The pure resolver (preference + OS signal → `"light" | "dark"`) lives
in [`src/shared/theme-resolver.ts`](../src/shared/theme-resolver.ts)
and is unit-tested at 100 % coverage.

Known small flaw: the first paint can briefly show the wrong theme
because `BrowserWindow.backgroundColor` is set to the light canvas in
main. The flash is ~50 ms. Tracked in
[gotchas.md](./gotchas.md).

## Processing

One control: **Edge mode** — a segmented control with three choices.
The chosen mode is sent to the worker via `set-config`; the worker
stores it as `currentEdgeMode` and applies it inside
`removeBackground()` after the model emits the mask.

| Mode | What the worker does | When to use |
|---|---|---|
| **Soft** | Returns the raw model mask byte-for-byte (well, a fresh `Uint8Array` copy). | Default. Best for photo subjects, antialiased outlines you'll composite onto similar backgrounds. |
| **Balanced** | Applies a smoothstep S-curve around 0.5: `v < 0.5 ? 2v² : 1 − 2(1−v)²`. Pulls mid-greys outward without losing antialiasing. | Mixed catalogues, when "Soft" leaves a faint halo. |
| **Crisp** | Binary threshold at 128 — every byte ends up 0 or 255. | Product shots on flat backgrounds. Razor edges, no fringe. |

Implementation lives in
[`src/worker/mask-postprocess.ts`](../src/worker/mask-postprocess.ts) —
a pure function with 100 % test coverage in
[`mask-postprocess.test.ts`](../src/worker/mask-postprocess.test.ts).

## About

| Row | Source |
|---|---|
| App | static |
| Version | `app.getVersion()` (reads `package.json`) |
| Electron | `process.versions.electron` |
| Node | `process.versions.node` |
| Platform | `process.platform` |
| Cache path | `app.getPath("userData") + "/models"` |

All five come back in one round-trip via the `get-app-info` IPC.

## Adding a new setting

1. Add the field to `Settings` in
   [`src/renderer/hooks/useSettings.ts`](../src/renderer/hooks/useSettings.ts)
   with a sensible default. Bump the storage key version (`v1` → `v2`)
   only if the shape change isn't backwards-compatible.
2. If the worker needs to know about it: add a payload field to the
   `set-config` message in
   [`src/shared/protocol.ts`](../src/shared/protocol.ts), handle it in
   [`src/worker/index.ts`](../src/worker/index.ts).
3. If main needs to compute or store it: add an IPC handler in
   [`src/main/ipc.ts`](../src/main/ipc.ts) and a method in
   [`src/preload/index.ts`](../src/preload/index.ts).
4. Render it in
   [`src/renderer/components/SettingsDrawer.tsx`](../src/renderer/components/SettingsDrawer.tsx).
5. **Test the pure logic.** If you added a new mask transform, edge
   mode, or anything mathematical, add a `*.test.ts` and include the
   file in `vitest.config.ts` `coverage.include`.
