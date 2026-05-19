/**
 * Batch-completion modal. Pops up the moment the worker emits the
 * last `done` event of a run.
 *
 * Design notes:
 *   - Hard-dark, always. Even when the app theme is light. Override
 *     the CSS variables at the modal root (no Tailwind `dark:`
 *     prefix needed — every utility below reads the new values).
 *     This makes the modal feel like a "moment" — a pause from the
 *     workspace, clean dark surface to admire the result on.
 *   - One real before/after using a randomly chosen succeeded job.
 *     The "after" sits on a checker so the transparency is visible
 *     even on the dark surface.
 *   - A handful of soft confetti shapes drift down behind the card.
 *     Pure CSS animation — no canvas, no library, no per-frame
 *     React state (would tank performance during 90-job batches).
 *   - "Open in Finder" is the primary action; "Close" is secondary.
 *   - ESC and click-outside both dismiss.
 *
 * The taste skill calls for tactile feedback: primary button does a
 * `translate-y-px` press, secondary does the same. Soft inner shadow
 * on the card for a sense of weight against the backdrop.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"

import type { JobState } from "@shared/protocol"

import { useTranslate } from "../hooks/useTranslate"

const DARK_TOKENS: CSSProperties = {
  // RGB triplets — same shape as :root in globals.css. Tailwind
  // utilities reading rgb(var(--c-...) / <alpha>) inherit these.
  ["--c-canvas" as string]: "12 10 9",
  ["--c-surface" as string]: "28 25 23",
  ["--c-hairline" as string]: "41 37 36",
  ["--c-hairline-subtle" as string]: "22 19 18",
  ["--c-ink" as string]: "250 250 249",
  ["--c-ink-muted" as string]: "168 162 158",
  ["--c-ink-subtle" as string]: "120 113 108",
  ["--c-action" as string]: "250 250 249",
  ["--c-action-hover" as string]: "231 229 228",
  ["--c-on-action" as string]: "12 10 9",
  ["--c-accent" as string]: "45 212 191",
  ["--c-accent-hover" as string]: "94 234 212",
  ["--c-success" as string]: "52 211 153",
  ["--c-warning" as string]: "251 191 36",
  ["--c-danger" as string]: "248 113 113",
}

export function DoneDialog(props: {
  open: boolean
  onClose: () => void
  doneCount: number
  failedCount: number
  outputFolder: string | null
  sampleJob: JobState | null
  failedJobs: JobState[]
  /** Wall-clock duration of the batch in milliseconds. `null` if we
   *  weren't able to time it (shouldn't happen in normal flow). */
  durationMs: number | null
}) {
  const { t, tn } = useTranslate()
  const onOpenFolder = useCallback(async () => {
    if (props.outputFolder) {
      await window.api.openPath(props.outputFolder)
    }
  }, [props.outputFolder])

  // ESC + click outside.
  useEffect(() => {
    if (!props.open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [props.open, props.onClose])

  if (!props.open) return null

  // Honest headlines depending on the outcome — no confetti rain
  // when nothing actually succeeded, no "All done" lie either.
  const allFailed = props.doneCount === 0 && props.failedCount > 0
  const headline = allFailed
    ? t("done.headlineAllFailed")
    : props.failedCount > 0
      ? t("done.headlineDoneWithErrors")
      : t("done.headlineAllDone")

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={DARK_TOKENS}
    >
      {/* Backdrop — heavy blur for the "moment" feel. Click to close. */}
      <button
        type="button"
        aria-label={t("btn.close")}
        onClick={props.onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-md"
      />

      {/* Confetti rain — skipped on full-failure runs. Nothing to
          celebrate when 0/N succeeded. */}
      {!allFailed && <Confetti />}

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="done-title"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-hairline bg-canvas text-ink shadow-[0_30px_60px_-12px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)_inset]"
      >
        <div className="flex flex-col items-center gap-6 px-8 pt-10 pb-8">
          {allFailed ? <DangerGlyph /> : <ConfettiGlyph />}

          <div className="flex flex-col items-center gap-1.5 text-center">
            <h2
              id="done-title"
              className="text-2xl font-semibold tracking-tight"
            >
              {headline}
            </h2>
            <p className="text-sm text-ink-muted">
              {tn(props.doneCount, "done.imagesProcessed")}
              {props.failedCount > 0 && (
                <>
                  {" · "}
                  <span className="text-danger">
                    {t("done.failedSuffix", { count: props.failedCount })}
                  </span>
                </>
              )}
            </p>
            {props.durationMs != null && (
              <p className="text-xs text-ink-subtle">
                <span className="tabular-nums">
                  {formatDuration(props.durationMs)}
                </span>
                {props.doneCount > 1 && (
                  <>
                    {" · "}
                    <span>
                      {t("done.durationPerImage", {
                        seconds: (
                          props.durationMs /
                          props.doneCount /
                          1000
                        ).toFixed(1),
                      })}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          {props.sampleJob && (
            <BeforeAfter
              job={props.sampleJob}
            />
          )}

          {props.failedJobs.length > 0 && (
            <FailuresPanel failures={props.failedJobs} />
          )}

          <div className="mt-2 flex w-full items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => void onOpenFolder()}
              disabled={!props.outputFolder}
              className={[
                "rounded-md bg-ink-950 px-5 py-2.5 text-sm font-semibold text-onAction shadow-soft",
                "transition-all duration-150 ease-smooth",
                "hover:bg-ink-800 active:translate-y-px",
                "focus-visible:focus-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
              ].join(" ")}
            >
              {t("done.btnOpenInFinder")}
            </button>
            <button
              type="button"
              onClick={props.onClose}
              className={[
                "rounded-md border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink-muted",
                "transition-all duration-150 ease-smooth",
                "hover:bg-hairlineSubtle hover:text-ink active:translate-y-px",
                "focus-visible:focus-ring",
              ].join(" ")}
            >
              {t("done.btnClose")}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Side-by-side before/after of a real completed job. Lazy-loads the
 * two images via the readImageAsDataUrl IPC. The output sits on a
 * checker pattern so the transparent areas read clearly even on a
 * dark surface.
 */
function BeforeAfter(props: { job: JobState }) {
  const { t } = useTranslate()
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setBefore(null)
    setAfter(null)
    setError(false)
    const load = async () => {
      try {
        const tasks: Promise<void>[] = []
        if (props.job.inputPath) {
          tasks.push(
            window.api.readImageAsDataUrl(props.job.inputPath).then((d) => {
              if (!cancelled) setBefore(d)
            }),
          )
        }
        if (props.job.outputPath) {
          tasks.push(
            window.api.readImageAsDataUrl(props.job.outputPath).then((d) => {
              if (!cancelled) setAfter(d)
            }),
          )
        }
        await Promise.all(tasks)
      } catch {
        if (!cancelled) setError(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [props.job.inputPath, props.job.outputPath])

  if (error) return null

  const beforeLabel = t("done.before")
  const afterLabel = t("done.after")
  const placeholderText = t("done.sourceUnavailable")
  return (
    <div className="grid w-full grid-cols-2 gap-3">
      {before ? (
        <PreviewTile label={beforeLabel} src={before} background="solid" />
      ) : props.job.inputPath ? (
        <PreviewTile label={beforeLabel} loading background="solid" />
      ) : (
        <PreviewTile
          label={beforeLabel}
          placeholder
          placeholderText={placeholderText}
          background="solid"
        />
      )}
      {after ? (
        <PreviewTile label={afterLabel} src={after} background="checker" />
      ) : (
        <PreviewTile label={afterLabel} loading background="checker" />
      )}
    </div>
  )
}

function PreviewTile(props: {
  label: string
  src?: string
  loading?: boolean
  placeholder?: boolean
  placeholderText?: string
  background: "solid" | "checker"
}) {
  const { t } = useTranslate()
  const bgStyle =
    props.background === "checker"
      ? {
          backgroundImage:
            "linear-gradient(45deg, #2a2a2e 25%, transparent 25%), linear-gradient(-45deg, #2a2a2e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2e 75%), linear-gradient(-45deg, transparent 75%, #2a2a2e 75%)",
          backgroundSize: "12px 12px",
          backgroundPosition: "0 0, 0 6px, 6px -6px, -6px 0",
          backgroundColor: "#1c1917",
        }
      : { backgroundColor: "#1c1917" }
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="relative aspect-square w-full overflow-hidden rounded-md border border-hairline"
        style={bgStyle}
      >
        {/* Inner padding: the image breathes inside the tile instead
            of bleeding to the rounded corners. 14 px on each side
            reads well at the modal's typical 220 px tile size. */}
        {props.src && (
          <img
            src={props.src}
            alt={props.label}
            className="absolute inset-3.5 h-[calc(100%-1.75rem)] w-[calc(100%-1.75rem)] object-contain"
            draggable={false}
          />
        )}
        {props.loading && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-ink-subtle">
            {t("btn.loading")}
          </div>
        )}
        {props.placeholder && (
          <div className="absolute inset-0 flex items-center justify-center px-3 text-center text-[11px] leading-snug text-ink-subtle">
            {props.placeholderText ?? t("done.sourceUnavailable")}
          </div>
        )}
      </div>
      <div className="text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {props.label}
      </div>
    </div>
  )
}

/**
 * Format a millisecond duration for the modal summary. Below 60s
 * shows fractional seconds; minute-plus shows `Nm Ss`.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec - m * 60)
  return `${m}m ${s}s`
}

/**
 * Per-failure list with a "Copy as text" affordance. The user
 * pastes the result into a spreadsheet to retry the failing URLs
 * or hand them off as a bug report.
 *
 * Layout: a small header ("3 failed"), a scrollable list of rows
 * with the source label + the error message, and the copy button.
 * Max ~4 visible rows then overflow scroll — we don't want the
 * failure list to dominate the modal.
 */
function FailuresPanel(props: { failures: JobState[] }) {
  const { t, tn } = useTranslate()
  const [copied, setCopied] = useState(false)

  const onCopy = useCallback(async () => {
    const failedFallback = t("progress.statusFailed")
    const text = props.failures
      .map((j) => `${j.label}\t${j.error ?? failedFallback}`)
      .join("\n")
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      const tm = setTimeout(() => setCopied(false), 1800)
      return () => clearTimeout(tm)
    } catch {
      // Clipboard blocked (rare in Electron). Silent fail.
    }
  }, [props.failures, t])

  return (
    <details className="group w-full">
      <summary
        className={[
          "flex cursor-pointer items-center gap-2 rounded-md border border-l-2 border-hairline border-l-danger bg-danger/[0.08] px-3 py-2",
          "transition-colors duration-150 ease-smooth",
          "hover:bg-danger/[0.12]",
          "focus-visible:focus-ring",
          "list-none [&::-webkit-details-marker]:hidden",
        ].join(" ")}
      >
        <Chevron />
        <span className="text-sm font-medium text-danger">
          {tn(props.failures.length, "done.failuresHeader")}
        </span>
        <span className="text-[11px] text-ink-muted">
          {t("done.failuresHint")}
        </span>
      </summary>

      <div className="mt-2 flex flex-col gap-2 rounded-md border border-hairline bg-surface/40 p-3">
        <ul className="max-h-40 overflow-y-auto divide-y divide-hairline">
          {props.failures.map((j) => (
            <li
              key={j.id}
              className="grid grid-cols-[1fr_1.4fr] gap-3 px-1 py-2 text-[11px]"
            >
              <span
                className="truncate font-mono text-ink"
                title={j.label}
              >
                {j.label}
              </span>
              <span
                className="truncate text-danger"
                title={j.error ?? t("progress.statusFailed")}
              >
                {j.error ?? t("progress.statusFailed")}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 pt-1 text-[11px]">
          <span className="text-ink-subtle">{t("done.failuresCopyHint")}</span>
          <button
            type="button"
            onClick={() => void onCopy()}
            className={[
              "rounded-md border border-hairline bg-surface px-2.5 py-1 font-medium text-ink",
              "transition-all duration-150 ease-smooth",
              "hover:bg-hairlineSubtle active:translate-y-px",
              "focus-visible:focus-ring",
            ].join(" ")}
          >
            {copied ? t("done.failuresCopied") : t("done.failuresCopyBtn")}
          </button>
        </div>
      </div>
    </details>
  )
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-danger transition-transform duration-150 ease-smooth group-open:rotate-90"
      aria-hidden
    >
      <path d="M4 2l4 4-4 4" />
    </svg>
  )
}

/**
 * Big celebratory glyph above the headline. Uses the literal
 * confetti emoji 🎉 the user asked for — at this size it reads
 * cleanly and signals success without screaming.
 */
function ConfettiGlyph() {
  return (
    <div className="relative grid h-16 w-16 place-items-center rounded-full bg-accent/10 ring-1 ring-accent/30">
      <span
        role="img"
        aria-label="celebration"
        className="text-[34px] leading-none"
      >
        🎉
      </span>
    </div>
  )
}

/**
 * The honest counterpart to ConfettiGlyph: shown when the whole
 * batch failed. A red ring around a warning glyph — no emoji, no
 * pretense of success.
 */
function DangerGlyph() {
  return (
    <div className="relative grid h-16 w-16 place-items-center rounded-full bg-danger/10 ring-1 ring-danger/30">
      <svg
        viewBox="0 0 24 24"
        width="30"
        height="30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-danger"
        aria-hidden
      >
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.41 0Z" />
      </svg>
    </div>
  )
}

/**
 * Twelve tiny rectangles drifting down behind the card. Pure CSS
 * keyframes (defined inline below) — no library, no canvas, no per
 * frame React updates. Each piece picks a random horizontal start
 * position, fall duration, and rotation via inline styles seeded at
 * mount time. Stable across re-renders so they don't restart.
 */
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ["#f87171", "#fbbf24", "#34d399", "#5eead4", "#a78bfa", "#fafaf9"]
    return Array.from({ length: 18 }, (_, i) => ({
      key: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.4 + Math.random() * 1.6,
      rotateStart: Math.random() * 360,
      rotateEnd: 360 + Math.random() * 720,
      color: colors[i % colors.length],
      size: 6 + Math.round(Math.random() * 6),
    }))
  }, [])
  return (
    <>
      <style>{CONFETTI_KEYFRAMES}</style>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p) => (
          <span
            key={p.key}
            className="absolute top-[-20px] block rounded-[1px]"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.4,
              backgroundColor: p.color,
              animation: `confetti-fall ${p.duration}s linear ${p.delay}s 1 both`,
              transform: `rotate(${p.rotateStart}deg)`,
              ["--confetti-rotate-end" as string]: `${p.rotateEnd}deg`,
            } as CSSProperties}
          />
        ))}
      </div>
    </>
  )
}

const CONFETTI_KEYFRAMES = `
@keyframes confetti-fall {
  0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
  10%  { opacity: 1; }
  100% { transform: translate3d(0, 100vh, 0) rotate(var(--confetti-rotate-end, 720deg)); opacity: 0; }
}
`
