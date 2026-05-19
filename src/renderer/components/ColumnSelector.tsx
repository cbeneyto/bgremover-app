/**
 * Sheet + column dropdowns. Two-column grid on widths ≥ sm; the
 * tool window is always at least 880×600 so this never actually
 * collapses, but the responsive prefix is cheap insurance against
 * future resize-down work.
 */

import type React from "react"

import type { SpreadsheetMeta } from "@shared/protocol"

import { useTranslate } from "../hooks/useTranslate"

export function ColumnSelector(props: {
  meta: SpreadsheetMeta | null
  sheetName: string | null
  columnLetter: string | null
  onSheetChange: (name: string) => void
  onColumnChange: (letter: string) => void
}) {
  const { t } = useTranslate()
  if (!props.meta) return null
  const headers = props.sheetName
    ? props.meta.headersBySheet[props.sheetName] ?? []
    : []
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label={t("field.sheet")}>
        <Select
          value={props.sheetName ?? ""}
          onChange={(e) => props.onSheetChange(e.target.value)}
        >
          {props.meta.sheets.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("field.urlColumn")}>
        <Select
          value={props.columnLetter ?? ""}
          onChange={(e) => props.onColumnChange(e.target.value)}
        >
          <option value="">{t("field.pickColumnDefault")}</option>
          {headers.map((h) => (
            <option key={h.letter} value={h.letter}>
              {h.letter}
              {h.header ? ` · ${h.header}` : ""}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-label font-semibold uppercase text-ink-subtle">
        {props.label}
      </label>
      {props.children}
    </div>
  )
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props
  return (
    <select
      {...rest}
      className={[
        "no-drag w-full appearance-none rounded-md border border-hairline bg-surface px-3 py-2 pr-9 text-sm text-ink",
        "transition-colors duration-150 ease-smooth",
        "hover:border-ink-subtle",
        "focus-visible:focus-ring focus-visible:border-accent",
        // Neutral caret — no gradient slop.
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 12%22 fill=%22none%22 stroke=%22%2357534e%22 stroke-width=%221.5%22><path d=%22M3 5l3 3 3-3%22/></svg>')]",
        "bg-[length:10px_10px] bg-[right_12px_center] bg-no-repeat",
        className ?? "",
      ].join(" ")}
    />
  )
}
