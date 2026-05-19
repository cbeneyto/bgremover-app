# Background Remover — Distribution

Built from this repo at version 0.1.0. Unsigned. First launch needs
internet to download the model weights (~180 MB); after that the
app runs fully offline.

## Files

| File | Platform | Size | Type |
|---|---|---|---|
| `Background Remover-0.1.0-arm64.dmg` | macOS Apple Silicon | ~347 MB | Standard `.dmg` |
| `Background Remover Setup 0.1.0.exe` | Windows x64 | ~343 MB | NSIS installer |

## How to install — macOS

1. Double-click `Background Remover-0.1.0-arm64.dmg`.
2. Drag *Background Remover* to the Applications folder.
3. **First launch only:** macOS Gatekeeper will say
   *"Background Remover can't be opened because Apple cannot
   check it for malicious software"*.
   - Click **Cancel** on that dialog.
   - Open Finder → Applications.
   - **Right-click** *Background Remover* → **Open**.
   - In the new dialog, click **Open**.
   - macOS remembers the decision. Future launches are silent.
4. If macOS Sequoia (15) refuses even after that:
   - **System Settings → Privacy & Security**.
   - Scroll to *"Background Remover was blocked from use…"*.
   - Click **Open Anyway**.

## How to install — Windows

1. Double-click `Background Remover Setup 0.1.0.exe`.
2. Windows SmartScreen will say *"Windows protected your PC"*.
   - Click **More info**.
   - Click **Run anyway**.
3. The NSIS installer asks where to install. Pick a location,
   click **Install**.
4. Launch *Background Remover* from the Start menu (or the
   shortcut the installer placed on your desktop).

## First-time setup inside the app

1. The app opens with a yellow banner *"First-time setup"*.
2. Click **Download model**. It pulls ~180 MB from Hugging Face.
   Progress bar shows live byte count.
3. When the banner disappears (model is ready), pick a **Source
   folder** (or Excel/CSV file, or Sheet URL) and an **Output
   folder**, then click **Process**.
4. Output PNGs land in your destination with transparent
   backgrounds.

## Where the app stores its files

| Thing | macOS | Windows |
|---|---|---|
| App data + model cache | `~/Library/Application Support/Background Remover/` | `%APPDATA%\Background Remover\` |
| Model weights (~180 MB) | …`/models/briaai/RMBG-1.4/` | …`\models\briaai\RMBG-1.4\` |
| Output PNGs | wherever you pick as the **Output folder** | same |

To start completely fresh: quit the app, delete the *Background
Remover* folder above, relaunch. The model re-downloads on the
next run.

## Reporting issues

Source repo: https://github.com/cbeneyto/bgremover-app

When filing an issue please include:
- OS + version (`About This Mac` or Windows *About* page)
- The exact error message (the app's "Settings → About" panel
  lists app/Electron/Node versions)
- Steps to reproduce
