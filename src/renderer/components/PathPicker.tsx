/**
 * Reusable "choose a path" row used for folder + file pickers.
 *
 * Layout: a small label sits above an inline row containing the
 * "Choose…" button and the truncated path display. We deliberately
 * do *not* render this inside a card — labels-above-row is enough
 * structural cue, and stacking cards inside cards is the AI tell
 * the skill bans (see docs/design.md, Rule 4).
 */

import { useTranslate } from "../hooks/useTranslate"

export function PathPicker(props: {
  label: string
  value: string | null
  onPick: () => void | Promise<void>
  placeholder?: string
  disabled?: boolean
}) {
  const { t } = useTranslate()
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-label font-semibold uppercase text-ink-subtle">
        {props.label}
      </label>
      <div className="flex items-center gap-2 no-drag">
        <button
          type="button"
          onClick={() => void props.onPick()}
          disabled={props.disabled}
          className={[
            "shrink-0 rounded-md border border-hairline bg-surface px-3.5 py-2 text-sm font-medium text-ink",
            "transition-all duration-150 ease-smooth",
            "hover:bg-hairlineSubtle active:translate-y-px",
            "focus-visible:focus-ring",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface",
          ].join(" ")}
        >
          {t("btn.choose")}
        </button>
        <div
          className={[
            "flex-1 truncate rounded-md border border-hairline bg-hairlineSubtle px-3 py-2 text-sm",
            props.value ? "font-mono text-xs text-ink" : "text-ink-subtle",
          ].join(" ")}
          title={props.value ?? undefined}
        >
          {props.value ?? (props.placeholder ?? t("field.nothingSelected"))}
        </div>
      </div>
    </div>
  )
}
