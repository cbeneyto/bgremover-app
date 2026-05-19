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
  // Construct into a local var first so any synchronous Electron
  // events fired during the constructor see a sane reference if
  // they reach back through `mainWindow`. The previous shape
  // (assigning to `mainWindow` and registering a separate
  // `browser-window-created` handler that read `mainWindow`)
  // crashed with "Object has been destroyed" on the macOS dock
  // re-open path: the new BrowserWindow's constructor fires
  // `browser-window-created` synchronously BEFORE the assignment
  // completes, so the handler saw the previous (now-destroyed)
  // window.
  const win = new BrowserWindow({
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })

  // Surface the initial model status as soon as the renderer is
  // ready to receive it. We bind to the new window directly
  // instead of the module-level `mainWindow` so a stale reference
  // can never sneak in.
  win.webContents.once("did-finish-load", () => {
    if (!win.isDestroyed()) {
      win.webContents.send("model:status", getModelStatus())
    }
  })

  // Null out the module-level pointer when the window goes away so
  // every other site (IPC handlers, worker event forwarders) sees
  // `null` instead of a dangling destroyed object. The "closed"
  // event fires AFTER all webContents teardown — safe to clear.
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null
  })

  if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"])
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"))
  }

  mainWindow = win
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

  // macOS dock re-open. The "Object has been destroyed" bug was
  // here: BEFORE we cleared `mainWindow` on close, this branch
  // would still see the OLD destroyed reference and the
  // browser-window-created handler (now moved into createWindow)
  // would crash. With the closed-handler nulling mainWindow we
  // can also rely on it as a safety net.
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
