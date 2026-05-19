/**
 * Slide-in settings drawer. Four sections:
 *   - Model: version + local revision + disk usage + actions.
 *   - Appearance: theme (system / light / dark).
 *   - Language: en / es.
 *   - Processing: edge-mode radio cards.
 *   - About: app / electron / node versions, model cache path.
 *
 * Persistence lives in localStorage via `useSettings`. The drawer
 * itself is uncontrolled state-wise — open/close is owned by the
 * parent (App.tsx) so the title-bar button can drive it.
 */

import { useCallback, useEffect, useState, type SVGProps } from "react"

import type { EdgeMode, ModelStatus } from "@shared/protocol"
import type { ThemePreference } from "@shared/theme-resolver"
import { EDGE_MODE_META } from "../../worker/mask-postprocess"

import { useSettings, type Locale } from "../hooks/useSettings"
import { useTranslate } from "../hooks/useTranslate"
import type { TranslationKey } from "../i18n/en"

interface AppInfo {
  appVersion: string
  electronVersion: string
  nodeVersion: string
  platform: NodeJS.Platform
  modelCacheBytes: number
  modelCacheDir: string
}

interface UpdateInfo {
  repo: string
  localRevision: string | null
  remoteRevision: string | null
  upToDate: boolean
}

const EDGE_MODES: EdgeMode[] = ["soft", "balanced", "crisp"]

const THEMES: { id: ThemePreference; labelKey: TranslationKey }[] = [
  { id: "system", labelKey: "settings.theme.system" },
  { id: "light", labelKey: "settings.theme.light" },
  { id: "dark", labelKey: "settings.theme.dark" },
]

const LOCALES: { id: Locale; labelKey: TranslationKey }[] = [
  { id: "en", labelKey: "settings.language.en" },
  { id: "es", labelKey: "settings.language.es" },
]

export function SettingsDrawer(props: {
  open: boolean
  onClose: () => void
  modelStatus: ModelStatus
}) {
  const { settings, setEdgeMode, setTheme, setLocale } = useSettings()
  const { t } = useTranslate()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [clearing, setClearing] = useState(false)

  const refreshInfo = useCallback(async () => {
    const next = await window.api.getAppInfo()
    setInfo(next)
  }, [])

  useEffect(() => {
    if (props.open) void refreshInfo()
  }, [props.open, refreshInfo, props.modelStatus.state])

  useEffect(() => {
    if (!props.open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [props.open, props.onClose])

  const onDownload = useCallback(async () => {
    await window.api.downloadModel()
  }, [])

  const onClearCache = useCallback(async () => {
    if (clearing) return
    setClearing(true)
    try {
      await window.api.clearModelCache()
      await refreshInfo()
    } finally {
      setClearing(false)
    }
  }, [clearing, refreshInfo])

  const onOpenCache = useCallback(async () => {
    await window.api.openModelCacheFolder()
  }, [])

  const onCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true)
    setUpdate(null)
    try {
      const u = await window.api.checkModelUpdates()
      setUpdate(u)
    } finally {
      setCheckingUpdate(false)
    }
  }, [])

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={props.onClose}
        className={[
          "fixed inset-0 z-40 bg-ink/30 transition-opacity duration-200 ease-smooth",
          props.open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      {/* Drawer panel */}
      <aside
        role="dialog"
        aria-label={t("settings.title")}
        aria-modal="true"
        className={[
          "fixed inset-y-0 right-0 z-50 flex w-[420px] max-w-full flex-col border-l border-hairline bg-canvas shadow-raise",
          "transition-transform duration-200 ease-smooth",
          props.open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="flex h-12 items-center justify-between border-b border-hairline bg-surface px-5">
          <div className="text-title font-semibold text-ink">
            {t("settings.title")}
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t("settings.closeAria")}
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-hairlineSubtle hover:text-ink focus-visible:focus-ring"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Model */}
          <Section
            title={t("settings.model.title")}
            description={t("settings.model.description")}
          >
            <KeyValue
              label={t("settings.model.repository")}
              value={<span className="font-mono">briaai/RMBG-1.4</span>}
            />
            <KeyValue
              label={t("settings.model.status")}
              value={<ModelStatusBadge status={props.modelStatus} />}
            />
            <KeyValue
              label={t("settings.model.localRevision")}
              value={
                update?.localRevision ? (
                  <span className="font-mono text-xs">
                    {update.localRevision.slice(0, 12)}
                  </span>
                ) : (
                  <span className="text-ink-subtle">
                    {t("settings.model.localRevisionHint")}
                  </span>
                )
              }
            />
            <KeyValue
              label={t("settings.model.diskUsage")}
              value={
                <span className="tabular-nums">
                  {info ? formatBytes(info.modelCacheBytes) : "…"}
                </span>
              }
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <SecondaryButton onClick={() => void onDownload()}>
                {props.modelStatus.state === "ready"
                  ? t("settings.model.btnRedownload")
                  : t("settings.model.btnDownload")}
              </SecondaryButton>
              <SecondaryButton
                onClick={() => void onClearCache()}
                disabled={clearing || info?.modelCacheBytes === 0}
              >
                {clearing
                  ? t("settings.model.btnClearing")
                  : t("settings.model.btnClear")}
              </SecondaryButton>
              <SecondaryButton onClick={() => void onOpenCache()}>
                {t("settings.model.btnOpen")}
              </SecondaryButton>
              <SecondaryButton
                onClick={() => void onCheckUpdate()}
                disabled={checkingUpdate}
              >
                {checkingUpdate
                  ? t("settings.model.btnCheckingUpdates")
                  : t("settings.model.btnCheckUpdates")}
              </SecondaryButton>
            </div>

            {update && (
              <div className="mt-3 rounded-md border border-hairline bg-surface px-3 py-2 text-xs">
                {update.remoteRevision == null ? (
                  <span className="text-ink-muted">
                    {t("settings.model.updateOffline")}
                  </span>
                ) : update.upToDate ? (
                  <span className="text-success">
                    {t("settings.model.updateUpToDate")}
                    <span className="ml-2 font-mono text-ink-subtle">
                      {update.remoteRevision.slice(0, 12)}
                    </span>
                  </span>
                ) : (
                  <span className="text-warning">
                    {t("settings.model.updateAvailable", {
                      sha: update.remoteRevision.slice(0, 12),
                    })}
                  </span>
                )}
              </div>
            )}
          </Section>

          {/* Appearance */}
          <Section
            title={t("settings.appearance.title")}
            description={t("settings.appearance.description")}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-label font-semibold uppercase text-ink-subtle">
                {t("settings.appearance.themeLabel")}
              </label>
              <div
                role="radiogroup"
                aria-label={t("settings.appearance.themeLabel")}
                className="inline-flex items-center gap-1 self-start rounded-lg bg-hairlineSubtle p-1"
              >
                {THEMES.map((opt) => {
                  const active = settings.theme === opt.id
                  return (
                    <button
                      key={opt.id}
                      role="radio"
                      aria-checked={active}
                      type="button"
                      onClick={() => setTheme(opt.id)}
                      className={[
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-smooth",
                        "focus-visible:focus-ring",
                        active
                          ? "bg-surface text-ink shadow-soft"
                          : "text-ink-muted hover:text-ink",
                      ].join(" ")}
                    >
                      <ThemeGlyph id={opt.id} />
                      {t(opt.labelKey)}
                    </button>
                  )
                })}
              </div>
            </div>
          </Section>

          {/* Language */}
          <Section
            title={t("settings.language.title")}
            description={t("settings.language.description")}
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-label font-semibold uppercase text-ink-subtle">
                {t("settings.language.label")}
              </label>
              <div
                role="radiogroup"
                aria-label={t("settings.language.label")}
                className="inline-flex items-center gap-1 self-start rounded-lg bg-hairlineSubtle p-1"
              >
                {LOCALES.map((opt) => {
                  const active = settings.locale === opt.id
                  return (
                    <button
                      key={opt.id}
                      role="radio"
                      aria-checked={active}
                      type="button"
                      onClick={() => setLocale(opt.id)}
                      className={[
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 ease-smooth",
                        "focus-visible:focus-ring",
                        active
                          ? "bg-surface text-ink shadow-soft"
                          : "text-ink-muted hover:text-ink",
                      ].join(" ")}
                    >
                      {t(opt.labelKey)}
                    </button>
                  )
                })}
              </div>
            </div>
          </Section>

          {/* Processing — edge mode */}
          <Section
            title={t("settings.processing.title")}
            description={t("settings.processing.description")}
          >
            <div
              role="radiogroup"
              aria-label={t("settings.processing.title")}
              className="flex flex-col gap-2"
            >
              {EDGE_MODES.map((mode) => (
                <EdgeModeCard
                  key={mode}
                  mode={mode}
                  active={settings.edgeMode === mode}
                  onSelect={() => setEdgeMode(mode)}
                />
              ))}
            </div>
          </Section>

          {/* About */}
          <Section title={t("settings.about.title")} description="">
            <KeyValue
              label={t("settings.about.appLabel")}
              value={t("header.brand")}
            />
            <KeyValue
              label={t("settings.about.versionLabel")}
              value={
                <span className="font-mono">{info?.appVersion ?? "…"}</span>
              }
            />
            <KeyValue
              label={t("settings.about.electronLabel")}
              value={
                <span className="font-mono">
                  {info?.electronVersion ?? "…"}
                </span>
              }
            />
            <KeyValue
              label={t("settings.about.nodeLabel")}
              value={
                <span className="font-mono">{info?.nodeVersion ?? "…"}</span>
              }
            />
            <KeyValue
              label={t("settings.about.platformLabel")}
              value={
                <span className="font-mono">{info?.platform ?? "…"}</span>
              }
            />
            <KeyValue
              label={t("settings.about.cachePathLabel")}
              value={
                <span
                  className="block truncate font-mono text-[11px]"
                  title={info?.modelCacheDir}
                >
                  {info?.modelCacheDir ?? "…"}
                </span>
              }
            />
          </Section>
        </div>
      </aside>
    </>
  )
}

function Section(props: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8 last:mb-0">
      <div className="mb-3">
        <h2 className="text-title font-semibold text-ink">{props.title}</h2>
        {props.description && (
          <p className="mt-0.5 text-xs text-ink-muted">{props.description}</p>
        )}
      </div>
      <div className="space-y-2">{props.children}</div>
    </section>
  )
}

function KeyValue(props: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-hairlineSubtle py-2 last:border-b-0">
      <span className="text-xs text-ink-muted">{props.label}</span>
      <span className="min-w-0 text-right text-xs text-ink">
        {props.value}
      </span>
    </div>
  )
}

function SecondaryButton(props: {
  onClick: () => void | Promise<void>
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => void props.onClick()}
      disabled={props.disabled}
      className={[
        "rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium text-ink",
        "transition-all duration-150 ease-smooth",
        "hover:bg-hairlineSubtle active:translate-y-px",
        "focus-visible:focus-ring",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface",
      ].join(" ")}
    >
      {props.children}
    </button>
  )
}

function ModelStatusBadge(props: { status: ModelStatus }) {
  const { t } = useTranslate()
  const tones: Record<ModelStatus["state"], string> = {
    checking: "text-ink-muted",
    missing: "text-warning",
    downloading: "text-accent",
    ready: "text-success",
    error: "text-danger",
  }
  const textKeys: Record<ModelStatus["state"], TranslationKey> = {
    checking: "modelStatus.checking",
    missing: "modelStatus.missing",
    downloading: "modelStatus.downloading",
    ready: "modelStatus.ready",
    error: "modelStatus.error",
  }
  return (
    <span className={tones[props.status.state]}>
      {t(textKeys[props.status.state])}
    </span>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 MB"
  const mb = bytes / (1024 * 1024)
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** ── Edge-mode card (uses the i18n keys) ───────────────────────── */

function EdgeModeCard(props: {
  mode: EdgeMode
  active: boolean
  onSelect: () => void
}) {
  const { t } = useTranslate()
  const meta = EDGE_MODE_META[props.mode]
  const titleKey =
    `settings.edge.${props.mode}Title` as TranslationKey
  const summaryKey =
    `settings.edge.${props.mode}Summary` as TranslationKey
  const useWhenKey =
    `settings.edge.${props.mode}UseWhen` as TranslationKey
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.active}
      onClick={props.onSelect}
      className={[
        "group flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left",
        "transition-all duration-150 ease-smooth",
        "focus-visible:focus-ring",
        props.active
          ? "border-accent bg-accent/[0.06] shadow-soft"
          : "border-hairline bg-surface hover:border-ink-subtle",
      ].join(" ")}
    >
      <EdgePreview mode={props.mode} active={props.active} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{t(titleKey)}</span>
          {meta.isDefault && (
            <span className="rounded-full bg-hairlineSubtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {t("settings.edge.defaultBadge")}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">
          {t(summaryKey)}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-ink-subtle">
          <span className="font-medium text-ink-muted">
            {t("settings.edge.useWhenLabel")}
          </span>{" "}
          {t(useWhenKey)}
        </p>
      </div>
    </button>
  )
}

function EdgePreview(props: { mode: EdgeMode; active: boolean }) {
  const id = `edge-grad-${props.mode}`
  let stops: { offset: string; opacity: number }[] = []
  if (props.mode === "soft") {
    stops = [
      { offset: "0%", opacity: 1 },
      { offset: "55%", opacity: 1 },
      { offset: "100%", opacity: 0 },
    ]
  } else if (props.mode === "balanced") {
    stops = [
      { offset: "0%", opacity: 1 },
      { offset: "70%", opacity: 1 },
      { offset: "82%", opacity: 0.5 },
      { offset: "94%", opacity: 0 },
      { offset: "100%", opacity: 0 },
    ]
  } else {
    stops = [
      { offset: "0%", opacity: 1 },
      { offset: "85%", opacity: 1 },
      { offset: "86%", opacity: 0 },
      { offset: "100%", opacity: 0 },
    ]
  }
  return (
    <div
      aria-hidden
      className={[
        "grid h-12 w-12 shrink-0 place-items-center rounded-md border",
        props.active ? "border-accent/40" : "border-hairline",
      ].join(" ")}
      style={{
        backgroundImage:
          "linear-gradient(45deg, rgb(var(--c-hairline-subtle)) 25%, transparent 25%), linear-gradient(-45deg, rgb(var(--c-hairline-subtle)) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgb(var(--c-hairline-subtle)) 75%), linear-gradient(-45deg, transparent 75%, rgb(var(--c-hairline-subtle)) 75%)",
        backgroundSize: "8px 8px",
        backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width="40"
        height="40"
        className={props.active ? "text-accent" : "text-ink"}
      >
        <defs>
          <radialGradient id={id} cx="50%" cy="50%" r="50%">
            {stops.map((s) => (
              <stop
                key={s.offset}
                offset={s.offset}
                stopColor="currentColor"
                stopOpacity={s.opacity}
              />
            ))}
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="14" fill={`url(#${id})`} />
      </svg>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

function ThemeGlyph(props: { id: ThemePreference }) {
  const common: SVGProps<SVGSVGElement> = {
    viewBox: "0 0 16 16",
    width: 13,
    height: 13,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  }
  if (props.id === "light") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="2.6" />
        <path d="M8 1.6v1.6M8 12.8v1.6M14.4 8h-1.6M3.2 8H1.6M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6L3.5 3.5" />
      </svg>
    )
  }
  if (props.id === "dark") {
    return (
      <svg {...common}>
        <path d="M13 9.2A5.4 5.4 0 016.8 3 5.4 5.4 0 1013 9.2z" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 2.5a5.5 5.5 0 010 11z" fill="currentColor" stroke="none" />
    </svg>
  )
}
