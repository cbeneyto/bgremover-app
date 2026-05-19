import { app, BrowserWindow, nativeImage, shell } from "electron"
import { existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { handleWorkerEvent, registerIpcHandlers } from "./ipc"
import { getModelStatus, ensureModelDir } from "./model-manager"
import {
  shutdownPermanently,
  startWorker,
} from "./worker-bridge"

// Override the OS-level app name so the macOS menu bar, dock, and
// activity monitor read "Background Remover" instead of the electron
// default. Must run before `app.whenReady()`.
app.setName("Background Remover")

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

function resolveWindowIcon(): Electron.NativeImage | undefined {
  // Order: packaged .icns/.ico (already in Resources), then the
  // universal PNG that `npm run icons` produces. In dev mode we use
  // the PNG directly so we don't need to keep .icns checked in.
  const candidates = [
    join(__dirname, "..", "..", "resources", "icon.png"),
    join(process.resourcesPath ?? "", "icon.png"),
  ]
  for (const c of candidates) {
    if (c && existsSync(c)) {
      const img = nativeImage.createFromPath(c)
      if (!img.isEmpty()) return img
    }
  }
  return undefined
}

function createWindow(): void {
  const icon = resolveWindowIcon()
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    title: "Background Remover",
    backgroundColor: "#fafaf9",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"))
  }
}

app.whenReady().then(async () => {
  // In dev (`npm run dev`) the underlying binary is Electron's
  // shipped `Electron.app`, whose `Info.plist` says CFBundleName =
  // "Electron" and ships the atom logo. macOS reads the dock label +
  // icon from that plist, so `app.setName()` above does not affect
  // them. Setting `app.dock.setIcon()` at runtime DOES override the
  // visible dock icon, even in dev — so at least the icon matches.
  // The label stays "Electron" in dev (we can't repackage Electron's
  // own bundle); packaged builds get both name + icon from the
  // generated `Info.plist` automatically. No-op on Windows / Linux.
  if (process.platform === "darwin" && app.dock) {
    const icon = resolveWindowIcon()
    if (icon) app.dock.setIcon(icon)
  }

  // Set up the model cache dir before any worker spawns.
  await ensureModelDir()

  // Drop any stale URL-source previews from previous runs. The
  // worker re-creates the dir lazily on the first URL job. Wrapped
  // in try/catch because failure here is purely cosmetic — at worst
  // the user gets last-run's preview instead of this-run's.
  try {
    rmSync(join(tmpdir(), "bgremover-sources"), {
      recursive: true,
      force: true,
    })
  } catch {
    /* ignore */
  }

  registerIpcHandlers(() => mainWindow)

  // Spawn the worker eagerly so the model warm-up happens while the
  // user is still wiring up inputs. If the model is missing the worker
  // will start the download as soon as the first job lands.
  startWorker((event) => {
    handleWorkerEvent(mainWindow, event)
  })

  createWindow()

  // Surface the initial model status to the renderer once it's ready.
  app.on("browser-window-created", () => {
    if (!mainWindow) return
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow?.webContents.send("model:status", getModelStatus())
    })
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  // Don't tear down the worker here — the user may re-open the window
  // via the dock on macOS, and we want to keep the warm model.
  if (process.platform !== "darwin") app.quit()
})

app.on("before-quit", () => {
  // Suppresses the auto-respawn in worker-bridge so the worker
  // actually stays dead while Electron shuts down.
  shutdownPermanently()
})
