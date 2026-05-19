/**
 * Segmented control. macOS-native feel: inactive tabs are plain
 * muted text, the active tab gets a white pill with a hairline
 * border + a 1px soft shadow.
 *
 * The track sits inside a stone-100 background so the active pill
 * reads as raised by 1px of light, not by a glow or by colour.
 */

import type { InputMode } from "@shared/protocol"

import type { TranslationKey } from "../i18n/en"
import { useTranslate } from "../hooks/useTranslate"

const TABS: { id: InputMode; labelKey: TranslationKey }[] = [
  { id: "folder", labelKey: "tabs.folder" },
  { id: "spreadsheet-local", labelKey: "tabs.spreadsheetLocal" },
  { id: "spreadsheet-url", labelKey: "tabs.spreadsheetUrl" },
]

export function InputModeTabs(props: {
  mode: InputMode
  onChange: (mode: InputMode) => void
}) {
  const { t } = useTranslate()
  return (
    <div
      role="tablist"
      aria-label="Input mode"
      className="no-drag inline-flex items-center gap-1 rounded-lg bg-hairlineSubtle p-1"
    >
      {TABS.map((tab) => {
        const active = props.mode === tab.id
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => props.onChange(tab.id)}
            className={[
              "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors duration-150 ease-smooth",
              "focus-visible:focus-ring",
              active
                ? "bg-surface text-ink shadow-soft"
                : "text-ink-muted hover:text-ink",
            ].join(" ")}
          >
            {t(tab.labelKey)}
          </button>
        )
      })}
    </div>
  )
}
