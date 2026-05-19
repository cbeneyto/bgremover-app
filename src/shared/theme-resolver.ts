/**
 * Pure resolver for the theme preference. Lives in `shared/` (not
 * in the renderer hooks dir) so it doesn't import React — tests can
 * exercise it in plain Node without any DOM mocks.
 */

export type ThemePreference = "system" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"

/**
 * Map a stored preference plus a snapshot of the OS-level
 * `prefers-color-scheme` signal onto the actual theme to apply.
 *
 *   resolveTheme("light",  _)     → "light"   (always)
 *   resolveTheme("dark",   _)     → "dark"    (always)
 *   resolveTheme("system", true)  → "dark"
 *   resolveTheme("system", false) → "light"
 */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === "system") return systemPrefersDark ? "dark" : "light"
  return preference
}
