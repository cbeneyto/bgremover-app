/**
 * Tiny i18n machinery. No external library — keys lookup + `{var}`
 * interpolation + a singular/plural picker is everything we need.
 */

import { en, type TranslationKey } from "./en"
import { es } from "./es"

export type Locale = "en" | "es"
export const SUPPORTED_LOCALES: Locale[] = ["en", "es"]
export const DEFAULT_LOCALE: Locale = "en"

const DICTS: Record<Locale, Record<TranslationKey, string>> = {
  en,
  es,
}

export type { TranslationKey }

/**
 * Pluralisation picker. Returns `${key}.one` when count === 1, else
 * `${key}.other`. We support only English and Spanish; both have
 * the same 1/many split, so a single rule covers them both.
 *
 * If you ever add a locale with a more complex rule (Russian,
 * Arabic), wrap this in Intl.PluralRules and switch on locale.
 */
export function pluralKey(
  base: string,
  count: number,
): TranslationKey {
  return `${base}.${count === 1 ? "one" : "other"}` as TranslationKey
}

/**
 * Look up a key in the active dictionary and substitute any `{var}`
 * placeholders. Falls back to the English value (then the raw key)
 * when a translation is missing — never throws.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  const dict = DICTS[locale] ?? en
  let value = dict[key] ?? en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
    }
  }
  return value
}
