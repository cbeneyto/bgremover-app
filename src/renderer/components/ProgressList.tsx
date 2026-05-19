/**
 * Per-job progress list + summary line + thin progress bar.
 *
 * Layout follows the "anti-card overuse" rule from the design skill:
 * job rows live inside a single surface with `divide-y` hairlines
 * between them, not as N stacked cards. Status reads top-to-bottom
 * via:
 *   - a 6px status dot (single accent for "running", success / danger
 *     / warning for terminal states),
 *   - a mono filename, mono output name (tabular hierarchy),
 *   - right-aligned duration in tabular-nums so columns don't jiggle
 *     as rows complete.
 *
 * The progress bar itself is intentionally slim (4px). Big bars
 * compete with the row list — and the row list is where the user
 * actually reads progress.
 */

import type { BatchSummary, JobState } from "@shared/protocol"

import { useTranslate } from "../hooks/useTranslate"

export function ProgressList(props: {
  jobs: JobState[]
  summary: BatchSummary
}) {
  const { t } = useTranslate()
  const { total, done, failed } = props.summary
  const finished = done + failed
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm text-ink-muted">
          {total === 0 ? (
            <span className="text-ink-subtle">{t("progress.idle")}</span>
          ) : (
            <span className="tabular-nums">
              <span className="font-medium text-ink">{finished}</span>
              <span className="text-ink-subtle"> / </span>
              <span>{total}</span>
              <span className="text-ink-subtle">
                {" "}
                {t("progress.summarySuffix")}
              </span>
              {failed > 0 && (
                <span className="ml-2 text-danger">
                  {t("progress.failed", { count: failed })}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="text-xs tabular-nums text-ink-subtle">
          {total === 0 ? "—" : `${pct}%`}
        </div>
      </div>

      <div className="h-1 overflow-hidden rounded-full bg-hairlineSubtle">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-smooth"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-hairline bg-surface">
        {props.jobs.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-hairlineSubtle">
            {props.jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function JobRow(props: { job: JobState }) {
  const { job } = props
  const { t } = useTranslate()
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <StatusDot status={job.status} />
      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
        <span
          className="min-w-0 flex-shrink truncate font-mono text-ink"
          title={job.label}
        >
          {job.label}
        </span>
        <span className="text-ink-subtle">→</span>
        <span
          className="min-w-0 flex-shrink truncate font-mono text-ink-muted"
          title={job.outputName}
        >
          {job.outputName}
        </span>
      </div>
      <div className="shrink-0 text-xs tabular-nums">
        <Tail job={job} t={t} />
      </div>
    </li>
  )
}

function Tail({
  job,
  t,
}: {
  job: JobState
  t: ReturnType<typeof useTranslate>["t"]
}) {
  if (job.status === "done" && job.ms != null) {
    return (
      <span className="text-ink-muted">
        {(job.ms / 1000).toFixed(1)}s
      </span>
    )
  }
  if (job.status === "error") {
    return (
      <span className="truncate text-danger" title={job.error}>
        {job.error ?? t("progress.statusFailed")}
      </span>
    )
  }
  if (job.status === "running") {
    return (
      <span className="text-accent">
        {phaseLabel(job.phase, t)}
      </span>
    )
  }
  if (job.status === "cancelled") {
    return <span className="text-warning">{t("progress.statusCancelled")}</span>
  }
  return <span className="text-ink-subtle">{t("progress.statusQueued")}</span>
}

function StatusDot(props: { status: JobState["status"] }) {
  const cls =
    props.status === "done"
      ? "bg-success"
      : props.status === "error"
        ? "bg-danger"
        : props.status === "running"
          ? "bg-accent animate-pulse"
          : props.status === "cancelled"
            ? "bg-warning"
            : "bg-ink-subtle/40"
  return (
    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />
  )
}

function phaseLabel(
  phase: JobState["phase"] | undefined,
  t: ReturnType<typeof useTranslate>["t"],
): string {
  switch (phase) {
    case "downloading":
      return t("progress.phaseDownloading")
    case "loading":
      return t("progress.phaseLoading")
    case "inferring":
      return t("progress.phaseInferring")
    case "writing":
      return t("progress.phaseWriting")
    default:
      return t("progress.phaseRunning")
  }
}

function EmptyState() {
  const { t } = useTranslate()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-12 text-center">
      <div className="text-sm font-medium text-ink">{t("empty.title")}</div>
      <div className="max-w-xs text-xs text-ink-muted">{t("empty.body")}</div>
    </div>
  )
}
