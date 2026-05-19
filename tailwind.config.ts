import type { Config } from "tailwindcss"

/**
 * Tokens are wired up via CSS variables defined in
 * `src/renderer/styles/globals.css` — there's a `:root` block for
 * the light theme and a `.dark` block for the dark theme. Switching
 * themes is a single class toggle on `<html>`; every utility that
 * uses a token rebinds automatically.
 *
 * Why CSS vars instead of Tailwind's `dark:` prefix everywhere: with
 * `dark:` you double the class soup on every component and it's easy
 * to forget a single override and ship a stranded "light fragment"
 * in dark mode. Tokens centralise the decision.
 *
 * The `<alpha-value>` placeholder lets utilities like `bg-canvas/80`
 * keep working — Tailwind substitutes the resolved opacity into the
 * `rgb()` call at compile time.
 */
const withAlpha = (cssVar: string) => `rgb(var(${cssVar}) / <alpha-value>)`

export default {
  darkMode: "class",
  content: ["./src/renderer/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // Surfaces
        canvas: withAlpha("--c-canvas"),
        surface: withAlpha("--c-surface"),
        // Borders
        hairline: withAlpha("--c-hairline"),
        hairlineSubtle: withAlpha("--c-hairline-subtle"),
        // Ink / text
        ink: {
          DEFAULT: withAlpha("--c-ink"),
          // Action colour — used by the primary "Process" /
          // "Download model" buttons. Swaps to a light value in
          // dark mode so the button stays high-contrast.
          950: withAlpha("--c-action"),
          800: withAlpha("--c-action-hover"),
          muted: withAlpha("--c-ink-muted"),
          subtle: withAlpha("--c-ink-subtle"),
        },
        // Single accent (desaturated teal)
        accent: {
          DEFAULT: withAlpha("--c-accent"),
          hover: withAlpha("--c-accent-hover"),
          tint: withAlpha("--c-accent-tint"),
          rule: withAlpha("--c-accent-rule"),
        },
        // Foreground for the action / primary button. Stays opposite
        // the action colour so the label always reads.
        onAction: withAlpha("--c-on-action"),
        // Status (desaturated in both themes)
        success: withAlpha("--c-success"),
        warning: withAlpha("--c-warning"),
        danger: withAlpha("--c-danger"),
      },
      fontFamily: {
        sans: [
          // Variable Inter — bundled via @fontsource-variable/inter
          // (see globals.css). System fallbacks cover the brief
          // window before the WOFF2 paints, plus any environment
          // where the bundled font fails to load.
          "Inter Variable",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        label: ["10px", { lineHeight: "14px", letterSpacing: "0.08em" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        title: ["15px", { lineHeight: "20px", letterSpacing: "-0.01em" }],
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "6px",
        lg: "10px",
      },
      boxShadow: {
        hairline: "0 0 0 1px rgb(var(--c-hairline) / 1)",
        soft: "0 1px 2px rgb(var(--c-shadow) / 0.06), 0 1px 1px rgb(var(--c-shadow) / 0.04)",
        raise:
          "0 1px 1px rgb(var(--c-shadow) / 0.04), 0 4px 12px -4px rgb(var(--c-shadow) / 0.12)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config
