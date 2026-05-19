/**
 * Resolves the user's theme preference into an actual class on
 * `<html>` and keeps it synced with both:
 *   - explicit changes (Settings → Theme),
 *   - the OS `prefers-color-scheme` media query (only matters when
 *     the preference is "system").
 *
 * Why this hook owns the DOM mutation: writing the class directly
 * inside `useSettings.setTheme` would couple state to side-effects.
 * Here we apply the class at the root and every consumer re-renders
 * through Tailwind's CSS-var bindings — no React reconcile cost.
 *
 * The pure preference-resolution logic lives in
 * `src/shared/theme-resolver.ts` so it can be unit-tested without
 * pulling React or matchMedia into the test env.
 */

import { useEffect } from "react"

import {
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "@shared/theme-resolver"

function applyTheme(t: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle("dark", t === "dark")
  root.classList.toggle("light", t === "light")
  // Hint the UA so native form controls (scrollbars, datepickers)
  // pick up the theme too — purely cosmetic, but free.
  root.style.colorScheme = t
}

export function useTheme(preference: ThemePreference): ResolvedTheme {
  // Synchronous read so the first paint reflects the persisted choice.
  const systemPrefersDark =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  const resolved = resolveTheme(preference, systemPrefersDark)

  // Apply on every render — cheap (class toggle), avoids race
  // conditions if the preference changes mid-session.
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  // Subscribe to OS-level theme changes, but only when the user
  // delegated to "system". Otherwise we'd override their explicit
  // choice when the OS flips at sunset.
  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = (e: MediaQueryListEvent) =>
      applyTheme(e.matches ? "dark" : "light")
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [preference])

  return resolved
}
