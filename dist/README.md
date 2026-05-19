# Background Remover — Distribution

Built from this repo at version 0.1.0. Unsigned. First launch needs
internet to download the model weights (~180 MB); after that the app
runs fully offline.

## Files

| File | Platform | Size | Type |
|---|---|---|---|
| `Background Remover-0.1.0-arm64.dmg` | macOS Apple Silicon | ~347 MB | Standard `.dmg` |
| `Background Remover-0.1.0-win-x64.zip` | Windows x64 | ~421 MB | Portable folder (see notes) |

The Windows artifact is a **zipped portable folder**, not an NSIS
installer `.exe`. The build that produced these ran on Apple Silicon
without wine installed, so the NSIS wrapper step couldn't run; the
inner `.exe` and all its dependencies are intact and work. See the
*Why a zip and not an installer?* section at the bottom for the
proper-installer instructions.

## How to install — macOS

1. Double-click `Background Remover-0.1.0-arm64.dmg`.
2. Drag *Background Remover* to the Applications folder.
3. **First launch only:** macOS will say *"Background Remover can't
   be opened because Apple cannot check it for malicious software"*.
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

1. Download `Background Remover-0.1.0-win-x64.zip`.
2. Right-click → **Extract All…**. Pick a destination (e.g. your
   Desktop or `C:\Program Files\Background Remover`).
3. Inside the extracted `win-unpacked` folder, double-click
   `Background Remover.exe`.
4. **First launch only:** Windows SmartScreen says *"Windows
   protected your PC"*.
   - Click **More info**.
   - Click **Run anyway**.

To keep a shortcut handy: right-click `Background Remover.exe` →
*Send to* → *Desktop (create shortcut)*.

## First-time setup inside the app

1. The app opens with a yellow banner *"First-time setup"*.
2. Click **Download model**. It pulls ~180 MB from Hugging Face.
   Progress bar shows live byte count.
3. When the banner disappears (model is ready), pick a **Source
   folder** (or Excel/CSV file, or Sheet URL) and an **Output
   folder**, then click **Process**.
4. Output PNGs land in your destination with transparent
   backgrounds.

## Why a zip and not an installer? (for the dev side)

A native NSIS installer `.exe` requires wine on the build machine
when cross-building from macOS. The build laptop didn't have wine
installed at the time these artifacts were generated, so the
electron-builder run produced the unpacked folder (`win-unpacked/`)
which is fully functional, just not wrapped into a single
self-extracting `.exe`. Zipping that folder gives the same end-user
result minus the install wizard.

To produce the proper installer instead:

```bash
brew install --cask wine-stable   # one-time, on the Mac build host
npm run pack:win                  # rebuilds with NSIS wrapper
```

The output replaces this zip with a `Background Remover Setup
0.1.0.exe`. Full recipe in `docs/packaging.md`.
