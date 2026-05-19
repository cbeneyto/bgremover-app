import type { TranslationKey } from "./en"

/**
 * Spanish dictionary. Typed as `Record<TranslationKey, string>` so
 * adding or removing a key in `en.ts` without mirroring here is a
 * compile error.
 *
 * Tone: neutral peninsular Spanish, "tú" form (not "usted"). Short
 * sentences — this is a tool UI, not marketing copy.
 */
export const es: Record<TranslationKey, string> = {
  // Header
  "header.brand": "Eliminador de fondos",
  "header.subtitle": "RMBG-1.4 · se ejecuta localmente",
  "header.modelReady": "Modelo listo",
  "header.modelDownloading": "Descargando modelo",
  "header.modelMissing": "Modelo pendiente",
  "header.modelError": "Error en el modelo",
  "header.modelChecking": "Comprobando modelo",
  "header.settingsAria": "Abrir ajustes",
  "header.settingsTitle": "Ajustes",

  // Splash
  "splash.loading": "Cargando",

  // Input section
  "input.title": "Entrada",
  "input.description": "Elige de dónde salen las imágenes.",
  "tabs.folder": "Carpeta",
  "tabs.spreadsheetLocal": "Excel · CSV",
  "tabs.spreadsheetUrl": "URL de hoja",

  // Path picker / fields
  "field.sourceFolder": "Carpeta de origen",
  "field.outputFolder": "Carpeta de destino",
  "field.spreadsheet": "Hoja · xlsx, csv, tsv",
  "field.sheet": "Hoja",
  "field.urlColumn": "Columna con URLs",
  "field.spreadsheetUrl": "URL de la hoja",
  "field.spreadsheetUrlPlaceholder":
    "https://docs.google.com/spreadsheets/d/…",
  "field.spreadsheetUrlHint":
    "Las URLs públicas de Google Sheets se reescriben al export xlsx automáticamente.",
  "field.outputPlaceholder": "Dónde irán los PNGs",
  "field.nothingSelected": "Sin selección",
  "field.pickColumnDefault": "— elige una columna —",

  // Buttons
  "btn.choose": "Elegir…",
  "btn.load": "Cargar",
  "btn.loading": "Cargando…",
  "btn.process": "Procesar",
  "btn.processImages.one": "Procesar {count} imagen",
  "btn.processImages.other": "Procesar {count} imágenes",
  "btn.processUrls.one": "Procesar {count} URL",
  "btn.processUrls.other": "Procesar {count} URLs",
  "btn.starting": "Iniciando…",
  "btn.cancel": "Cancelar",
  "btn.close": "Cerrar",

  // Footer line under Process
  "footer.outputLine":
    "Salida: PNG · fondo transparente · resolución original",

  // Count hints
  "count.counting": "Contando…",
  "count.reading": "Leyendo…",
  "count.imagesDetected.one": "{count} imagen detectada",
  "count.imagesDetected.other": "{count} imágenes detectadas",
  "count.urlsDetected.one": "{count} URL detectada",
  "count.urlsDetected.other": "{count} URLs detectadas",
  "count.noImages":
    "No hay imágenes ráster aquí (.jpg, .jpeg, .png, .webp).",
  "count.noUrls": "Esa columna no contiene URLs http(s).",

  // Errors
  "error.noImagesInFolder":
    "No se encontraron imágenes ráster en esa carpeta (.jpg / .jpeg / .png / .webp).",
  "error.noUrlsInColumn": "Esa columna no contiene URLs http(s).",
  "error.pickSpreadsheetFirst":
    "Primero elige una hoja, la pestaña y la columna.",

  // Progress
  "progress.idle": "En espera",
  "progress.summarySuffix": "procesadas",
  "progress.failed": "({count} fallidas)",
  "progress.phaseDownloading": "descargando…",
  "progress.phaseLoading": "cargando…",
  "progress.phaseInferring": "procesando…",
  "progress.phaseWriting": "escribiendo…",
  "progress.phaseRunning": "en curso…",
  "progress.statusQueued": "en cola",
  "progress.statusCancelled": "cancelada",
  "progress.statusFailed": "fallida",

  // Empty job list
  "empty.title": "Sin trabajos",
  "empty.body":
    "Elige una fuente arriba y una carpeta de destino, después pulsa Procesar. Los PNGs salen en el destino con fondo transparente.",

  // Model banner
  "banner.checking.title": "Comprobando el caché del modelo",
  "banner.checking.detail":
    "Buscando pesos cacheados en la carpeta de datos de la app.",
  "banner.missing.title": "Primera vez",
  "banner.missing.detail":
    "Pulsa Descargar modelo para obtener ~180 MB de pesos desde Hugging Face. Después de este paso único la app funciona totalmente offline.",
  "banner.downloading.title": "Descargando RMBG-1.4",
  "banner.downloading.detail":
    "Bajando pesos desde Hugging Face. No cierres la ventana.",
  "banner.error.title": "Error en el modelo",
  "banner.error.detailFallback":
    "Error desconocido al cargar el modelo.",
  "banner.download": "Descargar modelo",
  "banner.downloadStarting": "Iniciando…",

  // Settings drawer
  "settings.title": "Ajustes",
  "settings.closeAria": "Cerrar ajustes",

  "settings.appearance.title": "Apariencia",
  "settings.appearance.description":
    "Elige el esquema de color. «Sistema» sigue la preferencia del SO.",
  "settings.appearance.themeLabel": "Tema",
  "settings.theme.system": "Sistema",
  "settings.theme.light": "Claro",
  "settings.theme.dark": "Oscuro",

  "settings.language.title": "Idioma",
  "settings.language.description":
    "Idioma de la interfaz. Los errores del worker se mantienen en inglés.",
  "settings.language.label": "Idioma",
  "settings.language.en": "English",
  "settings.language.es": "Español",

  "settings.model.title": "Modelo",
  "settings.model.description":
    "Copia local de RMBG-1.4 usada en cada inferencia.",
  "settings.model.repository": "Repositorio",
  "settings.model.status": "Estado",
  "settings.model.localRevision": "Revisión local",
  "settings.model.localRevisionHint": "— comprueba actualizaciones —",
  "settings.model.diskUsage": "Uso en disco",
  "settings.model.btnDownload": "Descargar modelo",
  "settings.model.btnRedownload": "Volver a descargar",
  "settings.model.btnClear": "Vaciar caché",
  "settings.model.btnClearing": "Vaciando…",
  "settings.model.btnOpen": "Abrir en Finder",
  "settings.model.btnCheckUpdates": "Buscar actualizaciones",
  "settings.model.btnCheckingUpdates": "Buscando…",
  "settings.model.updateOffline":
    "No se pudo contactar con Hugging Face. Inténtalo más tarde.",
  "settings.model.updateUpToDate": "Al día.",
  "settings.model.updateAvailable":
    "Nueva revisión disponible — {sha}. Usa «Volver a descargar» para traerla.",

  "settings.processing.title": "Estilo de borde",
  "settings.processing.description":
    "Cómo se convierte la máscara del modelo en el canal alfa del PNG de salida.",
  "settings.edge.softTitle": "Suave",
  "settings.edge.softSummary":
    "Bordes naturales. Se conserva el degradado antialiased tal como sale del modelo.",
  "settings.edge.softUseWhen":
    "Pelo, pelaje, tela, vidrio, cualquier cosa con detalle fino.",
  "settings.edge.balancedTitle": "Equilibrado",
  "settings.edge.balancedSummary":
    "Bordes más limpios, menos halo alrededor del sujeto. Mantiene el antialiasing pero más ajustado.",
  "settings.edge.balancedUseWhen":
    "Catálogos mixtos con fondos cargados.",
  "settings.edge.crispTitle": "Nítido",
  "settings.edge.crispSummary":
    "Corte duro. Cada píxel queda totalmente opaco o totalmente transparente — sin término medio.",
  "settings.edge.crispUseWhen":
    "Productos sobre fondos planos, listos para componer sobre blanco u otro sólido.",
  "settings.edge.useWhenLabel": "Úsalo cuando:",
  "settings.edge.defaultBadge": "Por defecto",

  "settings.about.title": "Acerca de",
  "settings.about.appLabel": "App",
  "settings.about.versionLabel": "Versión",
  "settings.about.electronLabel": "Electron",
  "settings.about.nodeLabel": "Node",
  "settings.about.platformLabel": "Plataforma",
  "settings.about.cachePathLabel": "Ruta de caché",

  // Model status badges
  "modelStatus.checking": "Comprobando…",
  "modelStatus.missing": "Sin descargar",
  "modelStatus.downloading": "Descargando…",
  "modelStatus.ready": "Listo",
  "modelStatus.error": "Error",

  // Done dialog
  "done.headlineAllDone": "Todo listo",
  "done.headlineDoneWithErrors": "Hecho con errores",
  "done.headlineAllFailed": "El lote terminó con errores",
  "done.imagesProcessed.one": "{count} imagen procesada",
  "done.imagesProcessed.other": "{count} imágenes procesadas",
  "done.failedSuffix": "{count} fallidas",
  "done.durationPerImage": "{seconds}s por imagen",
  "done.before": "Antes",
  "done.after": "Después",
  "done.sourceUnavailable": "Fuente no disponible",
  "done.btnOpenInFinder": "Abrir en Finder",
  "done.btnClose": "Cerrar",
  "done.failuresHeader.one": "{count} fallida",
  "done.failuresHeader.other": "{count} fallidas",
  "done.failuresHint": "— pulsa para ver por qué",
  "done.failuresCopyHint":
    "Separado por tabuladores · pega en una hoja de cálculo",
  "done.failuresCopyBtn": "Copiar como texto",
  "done.failuresCopied": "Copiado ✓",
}
