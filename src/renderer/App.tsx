/**
 * Top-level page. Owns:
 *   - which input mode is active
 *   - the picks for that mode (folder path, spreadsheet meta, etc.)
 *   - the output folder
 *   - kicking off the batch and reading job updates
 *
 * Layout: a slim title bar (drag region for macOS hiddenInset) on
 * top, then a single calm body. Inputs live in ONE panel; the
 * output picker and the action row sit outside any card. This
 * deliberately avoids the "stacked cards" AI-tell — see
 * docs/design.md and docs/renderer.md.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { InputMode, JobInput, SpreadsheetMeta } from "@shared/protocol"

import { ColumnSelector } from "./components/ColumnSelector"
import { DoneDialog } from "./components/DoneDialog"
import { InputModeTabs } from "./components/InputModeTabs"
import { ModelDownloadBanner } from "./components/ModelDownloadBanner"
import { PathPicker } from "./components/PathPicker"
import { ProgressList } from "./components/ProgressList"
import { SettingsDrawer } from "./components/SettingsDrawer"
import { useJobs } from "./hooks/useJobs"
import { useModelStatus } from "./hooks/useModelStatus"
import { useSettings } from "./hooks/useSettings"
import { useTheme } from "./hooks/useTheme"
import { useTranslate } from "./hooks/useTranslate"

function baseNameNoExt(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"))
  const file = i >= 0 ? p.slice(i + 1) : p
  const dot = file.lastIndexOf(".")
  return dot > 0 ? file.slice(0, dot) : file
}

function paddedRow(i: number, total: number): string {
  const width = String(total).length
  return String(i + 1).padStart(width, "0")
}

export default function App() {
  const [mode, setMode] = useState<InputMode>("folder")
  const [folder, setFolder] = useState<string | null>(null)
  const [sheetFile, setSheetFile] = useState<string | null>(null)
  const [sheetUrl, setSheetUrl] = useState<string>("")
  const [sheetMeta, setSheetMeta] = useState<SpreadsheetMeta | null>(null)
  const [sheetName, setSheetName] = useState<string | null>(null)
  const [columnLetter, setColumnLetter] = useState<string | null>(null)
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [doneDialogOpen, setDoneDialogOpen] = useState(false)
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null)
  const [batchDuration, setBatchDuration] = useState<number | null>(null)
  // Pre-flight counts. `null` = not computed yet (no folder / no
  // column picked). `number` = we've counted; renderer shows the hint.
  const [folderImageCount, setFolderImageCount] = useState<number | null>(null)
  const [columnUrlCount, setColumnUrlCount] = useState<number | null>(null)
  const [countingUrls, setCountingUrls] = useState(false)

  const modelStatus = useModelStatus()
  const { jobs, summary, clear } = useJobs()
  const { t, tn } = useTranslate()

  // Subscribes the worker to the persisted edge-mode preference on
  // first render. The drawer also calls setEdgeMode when the user
  // flips it — see useSettings.
  const { settings } = useSettings()
  // Owns the DOM class on <html>. Reacts to both Settings changes
  // and the OS-level prefers-color-scheme media query (only when
  // the user picked "system").
  useTheme(settings.theme)

  // Re-count URLs whenever the user picks a different sheet or
  // column. Cancelled by `cancelled` if a faster pick races in.
  useEffect(() => {
    if (!sheetMeta || !sheetName || !columnLetter) {
      setColumnUrlCount(null)
      setCountingUrls(false)
      return
    }
    let cancelled = false
    setCountingUrls(true)
    void window.api
      .extractColumnUrls({
        filePath: sheetMeta.filePath,
        sheetName,
        columnLetter,
      })
      .then((urls) => {
        if (cancelled) return
        setColumnUrlCount(urls.length)
      })
      .catch(() => {
        if (cancelled) return
        setColumnUrlCount(0)
      })
      .finally(() => {
        if (!cancelled) setCountingUrls(false)
      })
    return () => {
      cancelled = true
    }
  }, [sheetMeta, sheetName, columnLetter])

  const canRun = useMemo(() => {
    if (!output) return false
    if (running) return false
    if (mode === "folder") {
      // Disable when we know the folder is empty. `null` means
      // we haven't counted yet — keep the button enabled so the
      // user isn't blocked while listFolderImages is in flight.
      return !!folder && folderImageCount !== 0
    }
    if (mode === "spreadsheet-local") {
      if (!sheetFile || !sheetName || !columnLetter) return false
      return columnUrlCount !== 0
    }
    if (mode === "spreadsheet-url") {
      if (!sheetMeta || !sheetName || !columnLetter) return false
      return columnUrlCount !== 0
    }
    return false
  }, [
    mode,
    folder,
    sheetFile,
    sheetMeta,
    sheetName,
    columnLetter,
    output,
    running,
    folderImageCount,
    columnUrlCount,
  ])

  /** Total items the next Process click will queue. Shown in the
   *  button label so the user knows what they're committing to. */
  const queueSize: number | null = useMemo(() => {
    if (mode === "folder") return folderImageCount
    if (mode === "spreadsheet-local" || mode === "spreadsheet-url") {
      return columnUrlCount
    }
    return null
  }, [mode, folderImageCount, columnUrlCount])

  const pickFolder = useCallback(async () => {
    const p = await window.api.pickFolder()
    if (!p) return
    setFolder(p)
    setFolderImageCount(null) // reset until count returns
    try {
      const files = await window.api.listFolderImages(p)
      setFolderImageCount(files.length)
    } catch {
      // Reading folder failed (permissions, missing, etc.). The
      // run() path will surface the real error; here we just say
      // "0 images" so the user knows to re-pick.
      setFolderImageCount(0)
    }
  }, [])

  const pickOutput = useCallback(async () => {
    const p = await window.api.pickSaveFolder()
    if (p) setOutput(p)
  }, [])

  const pickSheetFile = useCallback(async () => {
    setError(null)
    const p = await window.api.pickFile([
      { name: "Spreadsheets", extensions: ["xlsx", "csv", "tsv"] },
    ])
    if (!p) return
    setSheetFile(p)
    setLoadingMeta(true)
    try {
      const meta = await window.api.readSpreadsheetLocal(p)
      setSheetMeta(meta)
      setSheetName(meta.sheets[0] ?? null)
      setColumnLetter(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSheetMeta(null)
    } finally {
      setLoadingMeta(false)
    }
  }, [])

  const loadSheetUrl = useCallback(async () => {
    if (!sheetUrl.trim()) return
    setError(null)
    setLoadingMeta(true)
    try {
      const meta = await window.api.readSpreadsheetUrl(sheetUrl.trim())
      setSheetMeta(meta)
      setSheetName(meta.sheets[0] ?? null)
      setColumnLetter(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSheetMeta(null)
    } finally {
      setLoadingMeta(false)
    }
  }, [sheetUrl])

  const run = useCallback(async () => {
    if (!output) return
    setRunning(true)
    setError(null)
    clear()
    try {
      let jobs: JobInput[] = []
      if (mode === "folder" && folder) {
        const files = await window.api.listFolderImages(folder)
        if (files.length === 0) {
          setError(t("error.noImagesInFolder"))
          setRunning(false)
          return
        }
        jobs = files.map((file) => {
          const base = baseNameNoExt(file)
          return {
            id: cryptoId(),
            kind: "file",
            label: base,
            input: file,
            output: `${output}/${base}.png`,
          }
        })
      } else {
        if (!sheetMeta || !sheetName || !columnLetter) {
          throw new Error(t("error.pickSpreadsheetFirst"))
        }
        const urls = await window.api.extractColumnUrls({
          filePath: sheetMeta.filePath,
          sheetName,
          columnLetter,
        })
        if (urls.length === 0) {
          setError(t("error.noUrlsInColumn"))
          setRunning(false)
          return
        }
        jobs = urls.map((url, i) => {
          const base = `row_${paddedRow(i, urls.length)}`
          return {
            id: cryptoId(),
            kind: "url",
            label: url,
            url,
            output: `${output}/${base}.png`,
          }
        })
      }

      const res = await window.api.startBatch({ jobs })
      if (!res.ok) setError(res.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }, [mode, folder, sheetMeta, sheetName, columnLetter, output, clear])

  const cancel = useCallback(async () => {
    await window.api.cancelBatch()
  }, [])

  const batchActive =
    summary.total > 0 && summary.done + summary.failed < summary.total

  // Detect the moment the batch finishes — open the done dialog
  // exactly once per run. `prevFinishedRef` keeps us from
  // re-triggering on every re-render once finished is true.
  const finished =
    summary.total > 0 && summary.done + summary.failed >= summary.total
  const prevFinishedRef = useRef(false)
  useEffect(() => {
    if (finished && !prevFinishedRef.current) {
      setDoneDialogOpen(true)
    }
    prevFinishedRef.current = finished
  }, [finished])

  // Wall-clock duration of the batch. We track the start the moment
  // summary.total becomes non-zero (i.e. main acknowledged the
  // startBatch call) and freeze the duration when finished flips.
  // Reset on the next run via the same `total === 0` branch.
  useEffect(() => {
    if (summary.total === 0) {
      setBatchStartedAt(null)
      setBatchDuration(null)
      return
    }
    if (batchStartedAt === null) {
      setBatchStartedAt(Date.now())
    }
  }, [summary.total, batchStartedAt])

  useEffect(() => {
    if (finished && batchStartedAt !== null && batchDuration === null) {
      setBatchDuration(Date.now() - batchStartedAt)
    }
  }, [finished, batchStartedAt, batchDuration])

  // Pick one succeeded job to feature in the modal's preview. The
  // first one is fine (we don't want the dialog flickering between
  // samples as more jobs finish, but by the time it opens they're
  // all done so it doesn't matter — first is deterministic).
  const sampleJob = useMemo(
    () => jobs.find((j) => j.status === "done") ?? null,
    [jobs],
  )
  const failedJobs = useMemo(
    () => jobs.filter((j) => j.status === "error"),
    [jobs],
  )

  // Reserve room for the macOS traffic-light buttons (red / yellow /
  // green) which the OS draws on top of our content because we use
  // titleBarStyle: "hiddenInset". ~78 px is the standard inset.
  const isMac = window.api.platform === "darwin"
  const headerPadLeft = isMac ? "pl-[82px]" : "pl-5"

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Title bar — drag region for macOS, brand on left.
          Buttons inside need .no-drag to stay clickable. */}
      <header
        className={`drag-region flex h-12 items-center justify-between border-b border-hairline bg-surface pr-5 ${headerPadLeft}`}
      >
        <div className="no-drag flex items-center gap-2.5">
          <BrandMark />
          <div className="leading-tight">
            <div className="text-title font-semibold text-ink">
              {t("header.brand")}
            </div>
            <div className="text-[11px] text-ink-subtle">
              {t("header.subtitle")}
            </div>
          </div>
        </div>
        <div className="no-drag flex items-center gap-4">
          <div className="flex items-center gap-2 text-[11px] text-ink-subtle">
            <ModelDot status={modelStatus.state} />
            <span className="tabular-nums">
              {modelStatus.state === "ready"
                ? t("header.modelReady")
                : modelStatus.state === "downloading"
                  ? t("header.modelDownloading")
                  : modelStatus.state === "missing"
                    ? t("header.modelMissing")
                    : modelStatus.state === "error"
                      ? t("header.modelError")
                      : t("header.modelChecking")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("header.settingsAria")}
            title={t("header.settingsTitle")}
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-hairlineSubtle hover:text-ink focus-visible:focus-ring"
          >
            <SlidersIcon />
          </button>
        </div>
      </header>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        modelStatus={modelStatus}
      />

      <DoneDialog
        open={doneDialogOpen}
        onClose={() => setDoneDialogOpen(false)}
        doneCount={summary.done}
        failedCount={summary.failed}
        outputFolder={output}
        sampleJob={sampleJob}
        failedJobs={failedJobs}
        durationMs={batchDuration}
      />

      {/* Body — single column, generous gaps, no stacked cards. */}
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-hidden px-8 py-6">
        <ModelDownloadBanner status={modelStatus} />

        {/* Input panel — the ONE surface on the page. */}
        <section className="flex flex-col gap-5 rounded-lg border border-hairline bg-surface p-6 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-title font-semibold text-ink">
                {t("input.title")}
              </div>
              <div className="text-xs text-ink-muted">
                {t("input.description")}
              </div>
            </div>
            <InputModeTabs mode={mode} onChange={setMode} />
          </div>

          {mode === "folder" && (
            <div className="flex flex-col gap-2">
              <PathPicker
                label={t("field.sourceFolder")}
                value={folder}
                onPick={pickFolder}
                placeholder={t("field.nothingSelected")}
              />
              {folder && (
                <CountHint
                  count={folderImageCount}
                  unitKey="count.imagesDetected"
                  zeroMessage={t("count.noImages")}
                />
              )}
            </div>
          )}

          {mode === "spreadsheet-local" && (
            <div className="flex flex-col gap-4">
              <PathPicker
                label={t("field.spreadsheet")}
                value={sheetFile}
                onPick={pickSheetFile}
                disabled={loadingMeta}
              />
              <ColumnSelector
                meta={sheetMeta}
                sheetName={sheetName}
                columnLetter={columnLetter}
                onSheetChange={(name) => {
                  setSheetName(name)
                  setColumnLetter(null)
                }}
                onColumnChange={setColumnLetter}
              />
              {columnLetter && (
                <CountHint
                  count={countingUrls ? null : columnUrlCount}
                  unitKey="count.urlsDetected"
                  zeroMessage={t("count.noUrls")}
                  loadingMessage={t("count.counting")}
                />
              )}
            </div>
          )}

          {mode === "spreadsheet-url" && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-label font-semibold uppercase text-ink-subtle">
                  {t("field.spreadsheetUrl")}
                </label>
                <div className="flex gap-2 no-drag">
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder={t("field.spreadsheetUrlPlaceholder")}
                    className={[
                      "flex-1 rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle",
                      "transition-colors duration-150 ease-smooth",
                      "hover:border-ink-subtle",
                      "focus-visible:focus-ring focus-visible:border-accent",
                    ].join(" ")}
                  />
                  <button
                    type="button"
                    onClick={() => void loadSheetUrl()}
                    disabled={loadingMeta || !sheetUrl.trim()}
                    className={[
                      "shrink-0 rounded-md border border-hairline bg-surface px-3.5 py-2 text-sm font-medium text-ink",
                      "transition-all duration-150 ease-smooth",
                      "hover:bg-hairlineSubtle active:translate-y-px",
                      "focus-visible:focus-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                    ].join(" ")}
                  >
                    {loadingMeta ? t("btn.loading") : t("btn.load")}
                  </button>
                </div>
                <div className="text-[11px] text-ink-subtle">
                  {t("field.spreadsheetUrlHint")}
                </div>
              </div>
              <ColumnSelector
                meta={sheetMeta}
                sheetName={sheetName}
                columnLetter={columnLetter}
                onSheetChange={(name) => {
                  setSheetName(name)
                  setColumnLetter(null)
                }}
                onColumnChange={setColumnLetter}
              />
              {columnLetter && (
                <CountHint
                  count={countingUrls ? null : columnUrlCount}
                  unitKey="count.urlsDetected"
                  zeroMessage={t("count.noUrls")}
                  loadingMessage={t("count.counting")}
                />
              )}
            </div>
          )}
        </section>

        {/* Output picker — bare, not nested in a card. */}
        <PathPicker
          label={t("field.outputFolder")}
          value={output}
          onPick={pickOutput}
          placeholder={t("field.outputPlaceholder")}
        />

        {error && <ErrorBlock message={error} />}

        {/* Action row — primary action on the left, secondary cancel
            next to it, contextual hint on the right. */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void run()}
            disabled={!canRun || modelStatus.state === "error"}
            className={[
              "rounded-md bg-ink-950 px-5 py-2.5 text-sm font-semibold text-onAction shadow-soft",
              "transition-all duration-150 ease-smooth",
              "hover:bg-ink-800 active:translate-y-px",
              "focus-visible:focus-ring",
              "disabled:cursor-not-allowed disabled:bg-ink-subtle/40 disabled:text-ink-subtle disabled:shadow-none",
            ].join(" ")}
          >
            {running
              ? t("btn.starting")
              : queueSize && queueSize > 0
                ? mode === "folder"
                  ? tn(queueSize, "btn.processImages")
                  : tn(queueSize, "btn.processUrls")
                : t("btn.process")}
          </button>
          {batchActive && (
            <button
              type="button"
              onClick={() => void cancel()}
              className={[
                "rounded-md border border-hairline bg-surface px-3.5 py-2 text-sm font-medium text-ink-muted",
                "transition-all duration-150 ease-smooth",
                "hover:bg-hairlineSubtle hover:text-ink active:translate-y-px",
                "focus-visible:focus-ring",
              ].join(" ")}
            >
              {t("btn.cancel")}
            </button>
          )}
          <div className="ml-auto text-[11px] text-ink-subtle">
            {t("footer.outputLine")}
          </div>
        </div>

        <ProgressList jobs={jobs} summary={summary} />
      </main>
    </div>
  )
}

/** Single status dot for the title bar — quieter than a full chip. */
function ModelDot(props: { status: string }) {
  const cls =
    props.status === "ready"
      ? "bg-success"
      : props.status === "error"
        ? "bg-danger"
        : props.status === "downloading"
          ? "bg-accent animate-pulse"
          : "bg-warning"
  return <span className={`h-1.5 w-1.5 rounded-full ${cls}`} />
}

/** Horizontal sliders — reads unambiguously as "adjust settings" at
 *  any size. Three rails, three knobs at different positions so the
 *  glyph doesn't look static. */
function SlidersIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="2" y1="4" x2="14" y2="4" />
      <line x1="2" y1="8" x2="14" y2="8" />
      <line x1="2" y1="12" x2="14" y2="12" />
      <circle cx="10.5" cy="4" r="1.7" fill="currentColor" stroke="currentColor" />
      <circle cx="5" cy="8" r="1.7" fill="currentColor" stroke="currentColor" />
      <circle cx="11" cy="12" r="1.7" fill="currentColor" stroke="currentColor" />
    </svg>
  )
}

/** Compact mark used in the title bar — same picture-mountain
 *  glyph as the app icon (resources/icon.svg), simplified to read
 *  cleanly at 28 px. Uses the action / on-action token pair so it
 *  reads cleanly in both themes (dark square + light strokes in
 *  light mode, light square + dark strokes in dark mode). */
function BrandMark() {
  return (
    <div
      aria-hidden
      className="grid h-7 w-7 place-items-center rounded-md bg-ink-950 text-onAction"
    >
      <svg
        viewBox="0 0 28 28"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="6" width="16" height="16" rx="2.5" />
        <path d="M8.5 18 L13 13 L15.5 15.5 L17.5 13.5 L19.5 18" />
        <circle cx="10.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      </svg>
    </div>
  )
}

/**
 * Pre-flight count hint shown after the user picks a folder or a
 * spreadsheet column. Tells them how many items will be queued
 * BEFORE they click Process. Catches the "0 images" mistake early.
 *
 * Three states:
 *   - count === null              → "Counting…" (initial / in flight)
 *   - count === 0                 → red, `zeroMessage`
 *   - count > 0                   → muted text, localized "N items detected"
 *
 * `unitKey` names the translation base ("count.imagesDetected" or
 * "count.urlsDetected"). The hook's `tn()` helper picks the right
 * .one / .other suffix and interpolates {count}.
 */
function CountHint(props: {
  count: number | null
  unitKey: "count.imagesDetected" | "count.urlsDetected"
  zeroMessage: string
  loadingMessage?: string
}) {
  const { t, tn } = useTranslate()
  if (props.count === null) {
    return (
      <div className="flex items-center gap-1.5 pl-1 text-[11px] text-ink-subtle">
        <DotPulse />
        {props.loadingMessage ?? t("count.reading")}
      </div>
    )
  }
  if (props.count === 0) {
    return (
      <div className="flex items-center gap-1.5 pl-1 text-[11px] text-danger">
        <span className="h-1 w-1 shrink-0 rounded-full bg-danger" />
        {props.zeroMessage}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 pl-1 text-[11px] text-ink-muted">
      <span className="h-1 w-1 shrink-0 rounded-full bg-success" />
      <span>{tn(props.count, props.unitKey)}</span>
    </div>
  )
}

/** Pulsing dot used in the CountHint "Counting…" state. */
function DotPulse() {
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      <span className="absolute inset-0 animate-ping rounded-full bg-accent/40" />
      <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  )
}

function ErrorBlock(props: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-hairline border-l-2 border-l-danger bg-danger/[0.04] px-4 py-3 text-sm"
    >
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
      <div className="text-ink">{props.message}</div>
    </div>
  )
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `job-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
