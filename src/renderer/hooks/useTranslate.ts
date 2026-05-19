/**
 * React hook that returns a `t()` function bound to the current
 * locale. Subscribes to the same settings store as everything else
 * so a locale flip in Settings instantly retranslates the UI.
 *
 * Also: sets `document.documentElement.lang` to the active locale
 * so screen readers + native form widgets pick up the right
 * language for things like spellcheck on the URL input.
 */

import { useCallback, useEffect, useMemo } from "react"

import {
  pluralKey,
  translate,
  type Locale,
  type TranslationKey,
} from "../i18n"

import { useSettings } from "./useSettings"

export type TranslateFn = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string

export interface UseTranslateResult {
  locale: Locale
  t: TranslateFn
  /** "X images detected" — picks `${base}.one` / `${base}.other`. */
  tn: (count: number, base: string, vars?: Record<string, string | number>) => string
}

export function useTranslate(): UseTranslateResult {
  const { settings } = useSettings()
  const locale = settings.locale

  // Mirror the locale onto <html lang="..."> so the OS/browser
  // chrome (spellcheck, screen reader, etc.) picks it up.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback<TranslateFn>(
    (key, vars) => translate(locale, key, vars),
    [locale],
  )

  const tn = useCallback(
    (count: number, base: string, vars?: Record<string, string | number>) =>
      translate(locale, pluralKey(base, count), {
        count,
        ...(vars ?? {}),
      }),
    [locale],
  )

  return useMemo(() => ({ locale, t, tn }), [locale, t, tn])
}
