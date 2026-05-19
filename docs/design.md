# Design

Visual system for the bgremover desktop tool. Light-mode only.
DM Sans + system mono. Single accent (desaturated teal). Hairline
borders. No cards inside cards.

These rules live in [`tailwind.config.ts`](../tailwind.config.ts) as
named tokens and in [`src/renderer/styles/globals.css`](../src/renderer/styles/globals.css)
as base body styles. **Don't introduce new colours or font sizes in
component files** — extend the config instead so the rest of the app
stays coherent.

## Philosophy (overrides from the design-taste skill defaults)

The [design-taste-frontend skill](file:///Users/cbeneyto/.claude/skills/design-taste-frontend/SKILL.md)
ships with DESIGN_VARIANCE 8 / MOTION_INTENSITY 6 / VISUAL_DENSITY 4 —
designed for marketing sites and SaaS dashboards. **We dial that down
for this app:**

| Knob | Skill default | This app | Why |
|---|---|---|---|
| DESIGN_VARIANCE | 8 (asymmetric) | **3** (predictable) | This is a five-control tool. Variance for variance's sake is noise. |
| MOTION_INTENSITY | 6 (perpetual physics) | **3** (CSS transitions only) | A queue list re-flowing with spring physics is distracting; users come here to start a batch, not watch animation. |
| VISUAL_DENSITY | 4 (gallery) | **5** (daily app) | Tools need a bit more density. Not cockpit-dense — just enough to fit a 90-row job list without scrolling per row. |

We also explicitly **override the font ban**: the skill bans `Inter`
and recommends `Geist`/`Satoshi`. The user asked for Inter or DM
Sans; we picked **DM Sans**, which is freely licensed, shipped via
Google Fonts, and reads cleanly at 13–14 px on macOS.

## Tokens

The whole palette is wired through CSS variables in
[`src/renderer/styles/globals.css`](../src/renderer/styles/globals.css).
The `.dark` class on `<html>` flips every token at once. The Tailwind
config in [`tailwind.config.ts`](../tailwind.config.ts) wraps each
variable in `rgb(var(--c-…) / <alpha-value>)` so utilities like
`bg-canvas/80` still work.

**Why CSS vars instead of `dark:` everywhere:** with `dark:` you
double the class soup on every component and it's easy to forget a
single override and ship a stranded "light fragment" in dark mode.
Tokens centralise the decision in one file.

### Palette — light mode (`:root`)

| Token | Hex | Role |
|---|---|---|
| `canvas` | `#fafaf9` (stone-50) | Page background |
| `surface` | `#ffffff` | Panels, dropdowns, inputs |
| `hairline` | `#e7e5e4` (stone-200) | Primary borders |
| `hairlineSubtle` | `#f5f5f4` (stone-100) | Internal dividers |
| `ink.DEFAULT` | `#1c1917` (stone-900) | Primary text |
| `ink.muted` | `#57534e` (stone-600) | Secondary text |
| `ink.subtle` | `#a8a29e` (stone-400) | Tertiary text |
| `ink.950` (semantic: **action**) | `#0c0a09` | Primary action background |
| `ink.800` | `#292524` | Primary action hover |
| `onAction` | `#fafaf9` | Foreground on primary action |
| `accent.DEFAULT` | `#0f766e` (teal-700) | Focus ring, running dot, progress fill |
| `success` | `#059669` | Job done |
| `warning` | `#b45309` | Cancelled, banner accents |
| `danger` | `#b91c1c` | Errors |

### Palette — dark mode (`.dark`)

Same semantic tokens, inverted values where appropriate. `ink.950`
becomes light, `onAction` becomes dark — the primary button stays
"high-contrast action" without renaming a single Tailwind class in
the components.

| Token | Hex | Notes |
|---|---|---|
| `canvas` | `#0c0a09` (stone-950) | Warm near-black, never `#000` |
| `surface` | `#1c1917` (stone-900) | Panel surface |
| `hairline` | `#292524` (stone-800) | Borders |
| `hairlineSubtle` | `#161312` | Dividers + segmented-control track |
| `ink.DEFAULT` | `#fafaf9` | Primary text |
| `ink.muted` | `#a8a29e` | Secondary text |
| `ink.subtle` | `#78716c` | Tertiary text |
| `ink.950` (action) | `#fafaf9` | Inverts — primary action stays bright |
| `onAction` | `#0c0a09` | Foreground on the action — inverts |
| `accent.DEFAULT` | `#2dd4bf` (teal-400) | Lighter for dark-bg contrast |
| `success` | `#34d399` (emerald-400) | Bumped saturation for dark bg |
| `warning` | `#fbbf24` (amber-400) | |
| `danger` | `#f87171` (red-400) | |

**Banned in both:** pure black (`#000`), purple, neon gradients. The
"AI purple/blue" glow that ships with default Tailwind is forbidden.

### Typography

DM Sans (Google Fonts, weights 400/500/600/700) + system mono. Body
default is 14 px / 20 px / weight 400.

| Token | Spec | Use |
|---|---|---|
| `text-label` | 10 px / `letter-spacing: 0.08em` / `font-weight: 600` / uppercase | Section labels above inputs |
| `text-xs` | 12 px / 16 px | Helper text, durations, file paths (mono) |
| `text-sm` | 13 px / 18 px | Button labels, tab labels |
| `text-base` | 14 px / 20 px | Body text default |
| `text-title` | 15 px / 20 px / `letter-spacing: -0.01em` | Panel titles, brand mark |

`tabular-nums` is applied wherever numbers re-flow (durations, counts,
percentages, byte sizes). A counter that re-flows every tick reads as
broken.

### Spacing

Multiples of 4. Components target:

- Input padding: `py-2 px-3` (8 / 12) for selects/inputs, `py-2 px-3.5` (8 / 14) for buttons.
- Card padding: `p-6` (24).
- Vertical rhythm between sections inside the body: `gap-5` (20).
- Vertical rhythm inside the input card: `gap-5` between header and fields, `gap-4` between fields.
- Job row padding: `py-2.5 px-4` — tight enough to fit 12 rows on screen, loose enough to read.

Width: the main column caps at `max-w-3xl` (768 px) so the eye doesn't
have to track all the way across a 1100-px window. The title bar
spans full width.

### Borders & elevation

- All borders are `border border-hairline` (1 px, stone-200). No 2-px
  borders, ever — they read "default Tailwind."
- One shadow token: `shadow-soft` (`0 1px 2px rgba(28,25,23,0.04), 0 1px 1px rgba(28,25,23,0.03)`).
- The input card gets `shadow-soft`. Output picker, action row, job
  list do **not** — they live on the page surface.
- `shadow-raise` exists in tokens for future dialogs / popovers but
  is currently unused.

### Radii

- `rounded-md` (6 px) — buttons, inputs, selects, banner.
- `rounded-lg` (10 px) — the input section card.
- `rounded-full` — status dots, progress bar.

## Components

### Header (title bar)

- 48 px tall, full width, hairline bottom border, surface background.
- The whole bar is `drag-region` for macOS hidden-inset; the brand
  mark + status chip carve out `no-drag` regions.
- **Left padding adapts to platform.** On macOS we use `pl-[82px]`
  to clear the traffic-light buttons that the OS draws on top of our
  content under `titleBarStyle: "hiddenInset"`. On Windows / Linux
  we use the normal `pl-5`. The platform string comes through the
  preload as `window.api.platform`.
- Brand mark: a 28-px rounded tile holding a 14-px SVG (a frame + a
  picture-mountain glyph). No emoji.
- Status chip on the right: a 1.5-px dot + a one-word state. Pulses
  while downloading.

### Segmented tabs

The skill explicitly calls these out as the right pattern for a small
tool. Track in `hairlineSubtle`, active pill in `surface` with
`shadow-soft`. No icon, no animation beyond colour transition.

### Path picker rows

- Label above (`text-label`), action row below.
- Action row: button on the left, read-only path display on the right.
- Path display switches to mono + ink when filled; subtle + sans when
  empty — typography conveys the state.

### Buttons

Three flavours, all with the same easing curve (`ease-smooth` =
`cubic-bezier(0.16, 1, 0.3, 1)`) at 150 ms:

| Flavour | Background | Border | Text | Use |
|---|---|---|---|---|
| **Primary** | `ink.950`, hover `ink.800` | none | `surface` | The single "Process" button per screen |
| **Secondary** | `surface`, hover `hairlineSubtle` | `hairline` | `ink` | Choose…, Load, Cancel |
| **Ghost** | none, hover `hairlineSubtle` | none | `ink.muted` | (Reserved — not currently used) |

All buttons:
- `:active` → `translate-y-px` (no scale; scale on a square button
  feels gimmicky). Looks like the button is pressing into the page.
- `:disabled` → 50 % opacity, no shadow, no hover effect.
- Focus ring via the `focus-ring` utility class (defined in
  `globals.css`) — 2-px accent ring offset by 2 px against the
  surface.

### Inputs & selects

- `bg-surface`, `border-hairline`, `rounded-md`.
- Hover: `border-ink-subtle`. Focus: `border-accent` + accent focus ring.
- Selects use a custom 10-px chevron SVG embedded via `bg-[url(...)]`
  in `ColumnSelector.tsx`. No native browser chevron, no gradient.

### Progress list

- Wrapped in a single surface with `border-hairline`.
- Rows separated by `divide-y divide-hairlineSubtle` — no per-row
  cards.
- Each row: 6-px status dot · mono filename · arrow · mono output
  name · right-aligned tail.
- "Tail" shows: duration (`tabular-nums`) when done, phase label when
  running (in accent colour), error message when failed (in danger),
  "queued" otherwise.
- Empty state: a quiet two-line message — no illustration, no CTA,
  no emoji.

### Progress bar

- 4 px tall (slim — the row list is the real signal of progress).
- `bg-hairlineSubtle` track, `bg-accent` fill.
- Width animates via `transition-[width] duration-300 ease-smooth`.

### Banner

- Single row, left-rule + tinted background.
- Warning tone for missing/downloading model; danger tone for errors.
- Optional progress fill (4-px slim, same easing).

## Motion

Listed in full here so a future contributor can audit the surface:

- All hover/active transitions: `transition-all duration-150 ease-smooth`.
- All width transitions (progress bars): `duration-300 ease-smooth`.
- The "running" status dot and the title-bar download dot:
  `animate-pulse` (Tailwind built-in, 2-s pulse). Nothing else
  perpetually animates.
- No staggered list entrance. New job rows simply appear — this is a
  worker queue, not a marketing reveal.

If you ever need framer-motion, write the case down in
[`docs/gotchas.md`](./gotchas.md) first. The current motion budget is
"CSS transitions only," and that should stay the burden of proof.

## Accessibility

- `aria-selected` on the tabs.
- `role="status"` on the model banner, `role="alert"` on the error
  block.
- Focus rings via `:focus-visible` only — keyboard users see them,
  mouse users don't.
- Colour contrast: ink-on-canvas is 18.8:1; ink-muted-on-canvas is
  6.5:1; danger/warning/success against white surfaces all clear AA
  for body text. Verify any palette tweak against `webaim.org/resources/contrastchecker`.
