/**
 * English dictionary — the source of truth for translation keys.
 *
 * Conventions:
 *   - Flat keys with dotted namespaces (`header.brand`, `tabs.folder`).
 *   - Variables wrapped in `{name}` placeholders, substituted by
 *     the `t()` helper in `useTranslate.ts`.
 *   - Plurals use `.one` / `.other` suffixes when the singular and
 *     plural forms differ between EN and ES.
 *   - We deliberately don't translate worker / sharp / HTTP error
 *     messages — they're technical and would lose precision in
 *     translation. Their rendering context (`error.processGeneric`)
 *     prefixes them with a translated label and leaves the
 *     payload verbatim.
 *
 * The `as const` at the end gives us literal-typed keys so the ES
 * dictionary is typechecked against this shape.
 */
export const en = {
  // Header
  "header.brand": "Background Remover",
  "header.subtitle": "RMBG-1.4 · runs locally",
  "header.modelReady": "Model ready",
  "header.modelDownloading": "Downloading model",
  "header.modelMissing": "Model pending",
  "header.modelError": "Model error",
  "header.modelChecking": "Checking model",
  "header.settingsAria": "Open settings",
  "header.settingsTitle": "Settings",

  // Splash (also localised through this dictionary, even though
  // the initial paint uses inline English — once React mounts the
  // app reads from here).
  "splash.loading": "Loading",

  // Input section
  "input.title": "Input",
  "input.description": "Pick where the source images come from.",
  "tabs.folder": "Folder",
  "tabs.spreadsheetLocal": "Excel · CSV",
  "tabs.spreadsheetUrl": "Sheet URL",

  // Path picker / fields
  "field.sourceFolder": "Source folder",
  "field.outputFolder": "Output folder",
  "field.spreadsheet": "Spreadsheet · xlsx, csv, tsv",
  "field.sheet": "Sheet",
  "field.urlColumn": "URL column",
  "field.spreadsheetUrl": "Spreadsheet URL",
  "field.spreadsheetUrlPlaceholder": "https://docs.google.com/spreadsheets/d/…",
  "field.spreadsheetUrlHint":
    "Public Google Sheets URLs are rewritten to the xlsx export automatically.",
  "field.outputPlaceholder": "Where the PNGs go",
  "field.nothingSelected": "Nothing selected",
  "field.pickColumnDefault": "— pick a column —",

  // Buttons
  "btn.choose": "Choose…",
  "btn.load": "Load",
  "btn.loading": "Loading…",
  "btn.process": "Process",
  "btn.processImages.one": "Process {count} image",
  "btn.processImages.other": "Process {count} images",
  "btn.processUrls.one": "Process {count} URL",
  "btn.processUrls.other": "Process {count} URLs",
  "btn.starting": "Starting…",
  "btn.cancel": "Cancel",
  "btn.close": "Close",

  // Footer line under Process
  "footer.outputLine":
    "Output: PNG · transparent background · original resolution",

  // Count hints
  "count.counting": "Counting…",
  "count.reading": "Reading…",
  "count.imagesDetected.one": "{count} image detected",
  "count.imagesDetected.other": "{count} images detected",
  "count.urlsDetected.one": "{count} URL detected",
  "count.urlsDetected.other": "{count} URLs detected",
  "count.noImages":
    "No raster images here (.jpg, .jpeg, .png, .webp).",
  "count.noUrls": "That column has no http(s) URLs.",

  // Errors (renderer-level — worker messages stay in English)
  "error.noImagesInFolder":
    "No raster images found in that folder (.jpg / .jpeg / .png / .webp).",
  "error.noUrlsInColumn": "That column has no http(s) URLs.",
  "error.pickSpreadsheetFirst":
    "Pick a spreadsheet, a sheet, and a column first.",

  // Progress
  "progress.idle": "Idle",
  "progress.summarySuffix": "processed",
  "progress.failed": "({count} failed)",
  "progress.phaseDownloading": "downloading…",
  "progress.phaseLoading": "loading…",
  "progress.phaseInferring": "processing…",
  "progress.phaseWriting": "writing…",
  "progress.phaseRunning": "running…",
  "progress.statusQueued": "queued",
  "progress.statusCancelled": "cancelled",
  "progress.statusFailed": "failed",

  // Empty job list
  "empty.title": "No jobs yet",
  "empty.body":
    "Pick an input above and a destination folder, then press Process. Output PNGs land in your destination with transparent backgrounds.",

  // Model banner
  "banner.checking.title": "Checking model cache",
  "banner.checking.detail":
    "Looking for cached weights in the app data folder.",
  "banner.missing.title": "First-time setup",
  "banner.missing.detail":
    "Click Download model to fetch ~180 MB of weights from Hugging Face. After this one-time step the app runs fully offline.",
  "banner.downloading.title": "Downloading RMBG-1.4",
  "banner.downloading.detail":
    "Pulling weights from Hugging Face. Keep the window open.",
  "banner.error.title": "Model error",
  "banner.error.detailFallback":
    "Unknown error while loading the model.",
  "banner.download": "Download model",
  "banner.downloadStarting": "Starting…",

  // Settings drawer
  "settings.title": "Settings",
  "settings.closeAria": "Close settings",

  "settings.appearance.title": "Appearance",
  "settings.appearance.description":
    "Choose the colour scheme. System follows your OS setting.",
  "settings.appearance.themeLabel": "Theme",
  "settings.theme.system": "System",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",

  "settings.language.title": "Language",
  "settings.language.description":
    "Interface language. Worker error messages stay in English.",
  "settings.language.label": "Language",
  "settings.language.en": "English",
  "settings.language.es": "Español",

  "settings.model.title": "Model",
  "settings.model.description":
    "The local copy of RMBG-1.4 used for every inference.",
  "settings.model.repository": "Repository",
  "settings.model.status": "Status",
  "settings.model.localRevision": "Local revision",
  "settings.model.localRevisionHint": "— check updates —",
  "settings.model.diskUsage": "Disk usage",
  "settings.model.btnDownload": "Download model",
  "settings.model.btnRedownload": "Re-download",
  "settings.model.btnClear": "Clear cache",
  "settings.model.btnClearing": "Clearing…",
  "settings.model.btnOpen": "Open in Finder",
  "settings.model.btnCheckUpdates": "Check for updates",
  "settings.model.btnCheckingUpdates": "Checking…",
  "settings.model.updateOffline":
    "Couldn't reach Hugging Face. Try again later.",
  "settings.model.updateUpToDate": "Up to date.",
  "settings.model.updateAvailable":
    "New revision available — {sha}. Use Re-download to pull it.",

  "settings.processing.title": "Edge style",
  "settings.processing.description":
    "How the raw model mask becomes the alpha channel of the output PNG.",
  "settings.edge.softTitle": "Soft",
  "settings.edge.softSummary":
    "Natural edges. Antialiased fade preserved exactly as the model produces it.",
  "settings.edge.softUseWhen":
    "Hair, fur, fabric, glass, anything with fine detail.",
  "settings.edge.balancedTitle": "Balanced",
  "settings.edge.balancedSummary":
    "Cleaner edges, less halo around the subject. Antialiasing kept but tightened.",
  "settings.edge.balancedUseWhen":
    "Mixed catalogue photos with cluttered backgrounds.",
  "settings.edge.crispTitle": "Crisp",
  "settings.edge.crispSummary":
    "Hard cut. Every pixel is fully opaque or fully transparent — no in-between.",
  "settings.edge.crispUseWhen":
    "Products on flat backgrounds, ready to composite on white or another solid.",
  "settings.edge.useWhenLabel": "Use when:",
  "settings.edge.defaultBadge": "Default",

  "settings.about.title": "About",
  "settings.about.appLabel": "App",
  "settings.about.versionLabel": "Version",
  "settings.about.electronLabel": "Electron",
  "settings.about.nodeLabel": "Node",
  "settings.about.platformLabel": "Platform",
  "settings.about.cachePathLabel": "Cache path",

  // Model status badges
  "modelStatus.checking": "Checking…",
  "modelStatus.missing": "Not downloaded",
  "modelStatus.downloading": "Downloading…",
  "modelStatus.ready": "Ready",
  "modelStatus.error": "Error",

  // Done dialog
  "done.headlineAllDone": "All done",
  "done.headlineDoneWithErrors": "Done with errors",
  "done.headlineAllFailed": "Batch finished with errors",
  "done.imagesProcessed.one": "{count} image processed",
  "done.imagesProcessed.other": "{count} images processed",
  "done.failedSuffix": "{count} failed",
  "done.durationPerImage": "{seconds}s per image",
  "done.before": "Before",
  "done.after": "After",
  "done.sourceUnavailable": "Source not available",
  "done.btnOpenInFinder": "Open in Finder",
  "done.btnClose": "Close",
  "done.failuresHeader.one": "{count} failed",
  "done.failuresHeader.other": "{count} failed",
  "done.failuresHint": "— click to see why",
  "done.failuresCopyHint": "Tab-separated · paste into a spreadsheet",
  "done.failuresCopyBtn": "Copy as text",
  "done.failuresCopied": "Copied ✓",
} as const

export type TranslationKey = keyof typeof en
