/**
 * Renderer-side settings store. Persists to localStorage and
 * notifies every `useSettings()` consumer when a setting changes.
 *
 * Why a store (not plain useState): each `useSettings()` call would
 * otherwise create its own React state. With two consumers (App.tsx
 * for the theme effect + SettingsDrawer.tsx for the UI), changes
 * from the drawer wouldn't propagate to the App's `useTheme` — the
 * drawer's segmented control would flip but the actual theme class
 * on `<html>` would never update.
 *
 * The store lives at module scope via `createStore` (see
 * `src/shared/create-store.ts`, fully unit-tested). Reads are
 * synchronous, writes fan out to all subscribers via React state.
 */

import { useCallback, useEffect, useState } from "react"

import { createStore } from "@shared/create-store"
import { DEFAULT_EDGE_MODE, type EdgeMode } from "@shared/protocol"
import type { ThemePreference } from "@shared/theme-resolver"

import { DEFAULT_LOCALE, type Locale } from "../i18n"

export type { ThemePreference } from "@shared/theme-resolver"
export type { Locale } from "../i18n"

export interface Settings {
  edgeMode: EdgeMode
  theme: ThemePreference
  locale: Locale
}

const STORAGE_KEY = "bgremover.settings.v1"

const DEFAULTS: Settings = {
  edgeMode: DEFAULT_EDGE_MODE,
  theme: "system",
  locale: DEFAULT_LOCALE,
}

function readFromStorage(): Settings {
  if (typeof localStorage === "undefined") return DEFAULTS
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return DEFAULTS
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return DEFAULTS
  }
}

function writeToStorage(s: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* quota exceeded or storage disabled — ignore */
  }
}

// ── Single shared store ──────────────────────────────────────────
const store = createStore<Settings>(readFromStorage())

// Persist on every write. Listener registered once at module load.
store.subscribe(writeToStorage)

// Tracks whether we've already pushed the initial edge-mode IPC to
// the worker on this session. Module-scoped so multiple consumers
// don't fan it out.
let initialIpcSent = false

export function useSettings(): {
  settings: Settings
  setEdgeMode: (mode: EdgeMode) => void
  setTheme: (theme: ThemePreference) => void
  setLocale: (locale: Locale) => void
} {
  const [settings, setSettings] = useState<Settings>(() => store.get())

  // Subscribe to store updates. Unsubscribe on unmount.
  useEffect(() => {
    const unsub = store.subscribe(setSettings)
    // The store could have changed between the initial useState
    // read and the effect running. Re-sync to be safe.
    const current = store.get()
    if (current !== settings) setSettings(current)
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // On first mount across the whole app, push the persisted edge
  // mode to the worker so it isn't stuck on the default if the
  // user changed it last session.
  useEffect(() => {
    if (initialIpcSent) return
    initialIpcSent = true
    void window.api.setEdgeMode(store.get().edgeMode)
  }, [])

  const setEdgeMode = useCallback((mode: EdgeMode) => {
    store.update((prev) =>
      prev.edgeMode === mode ? prev : { ...prev, edgeMode: mode },
    )
    void window.api.setEdgeMode(mode)
  }, [])

  const setTheme = useCallback((theme: ThemePreference) => {
    store.update((prev) =>
      prev.theme === theme ? prev : { ...prev, theme },
    )
  }, [])

  const setLocale = useCallback((locale: Locale) => {
    store.update((prev) =>
      prev.locale === locale ? prev : { ...prev, locale },
    )
  }, [])

  return { settings, setEdgeMode, setTheme, setLocale }
}
