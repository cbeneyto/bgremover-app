/**
 * Status banner shown above the input section while the model is
 * unavailable. Styled as a left-rule + tinted background rather than
 * a boxed card — keeps the page feeling structurally calm.
 *
 * When the model is `missing` the banner offers an explicit
 * "Download model" button. Auto-download on app boot was deliberately
 * removed (see docs/model.md) so the user knows what's happening
 * and we don't surprise them with a ~180 MB network fetch.
 */

import { useCallback, useState } from "react"

import type { ModelStatus } from "@shared/protocol"

import { useTranslate, type TranslateFn } from "../hooks/useTranslate"

export function ModelDownloadBanner(props: { status: ModelStatus }) {
  const { t } = useTranslate()
  const { status } = props
  const [pending, setPending] = useState(false)

  const download = useCallback(async () => {
    setPending(true)
    try {
      await window.api.downloadModel()
    } finally {
      setPending(false)
    }
  }, [])

  if (status.state === "ready") return null

  const pct =
    status.state === "downloading" && status.total && status.downloaded
      ? Math.min(100, Math.round((status.downloaded / status.total) * 100))
      : null

  const tone = status.state === "error" ? "danger" : "warning"
  const toneClasses =
    tone === "danger"
      ? "border-l-danger bg-danger/[0.04]"
      : "border-l-warning bg-warning/[0.06]"
  const titleClasses =
    tone === "danger" ? "text-danger" : "text-warning"

  const showDownloadButton =
    status.state === "missing" || status.state === "error"

  return (
    <div
      role="status"
      className={`rounded-md border border-hairline border-l-2 px-4 py-3 ${toneClasses}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium ${titleClasses}`}>
            {title(status, t)}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">{detail(status, t)}</div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {showDownloadButton && (
            <button
              type="button"
              onClick={() => void download()}
              disabled={pending}
              className={[
                "rounded-md bg-ink-950 px-3.5 py-1.5 text-xs font-semibold text-onAction",
                "transition-all duration-150 ease-smooth",
                "hover:bg-ink-800 active:translate-y-px",
                "focus-visible:focus-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
              ].join(" ")}
            >
              {pending ? t("banner.downloadStarting") : t("banner.download")}
            </button>
          )}
        </div>
      </div>

      {pct != null && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-warning/15">
            <div
              className="h-full rounded-full bg-warning transition-[width] duration-300 ease-smooth"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-semibold tabular-nums text-warning">
              {pct}%
            </div>
            <div className="font-mono text-[11px] tabular-nums text-ink-muted">
              {fmt(status.downloaded ?? 0)} / {fmt(status.total ?? 0)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function title(s: ModelStatus, t: TranslateFn): string {
  switch (s.state) {
    case "checking":
      return t("banner.checking.title")
    case "missing":
      return t("banner.missing.title")
    case "downloading":
      return t("banner.downloading.title")
    case "error":
      return t("banner.error.title")
    default:
      return ""
  }
}

function detail(s: ModelStatus, t: TranslateFn): string {
  switch (s.state) {
    case "checking":
      return t("banner.checking.detail")
    case "missing":
      return t("banner.missing.detail")
    case "downloading":
      return t("banner.downloading.detail")
    case "error":
      return s.error ?? t("banner.error.detailFallback")
    default:
      return ""
  }
}

function fmt(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(1)} MB`
}
