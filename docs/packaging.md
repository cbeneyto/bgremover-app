# Packaging

How to produce installers (or installer-equivalents) you can hand
to a third party. This doc reflects what actually works today —
including the rough edges.

## TL;DR — the two targets

| Target | Recipe | Output | Status |
|---|---|---|---|
| **macOS** (Apple Silicon `.dmg`) | `npm run pack:mac` on a Mac | `release/Background Remover-<version>-arm64.dmg` (~347 MB) | ✅ Works end-to-end |
| **Windows** (`.exe` NSIS installer) | `npm run pack:win` **on Windows** | `release/Background Remover Setup <version>.exe` | ✅ Works on Windows |
| Windows (cross-build on Mac) | `npm run pack:win` on macOS + wine | Same as above | ⚠️ Needs wine + Rosetta on Apple Silicon |
| Windows (no installer) | `npm run pack:win` on Mac, NSIS step fails, ZIP the `release/win-unpacked/` folder | A zip the user extracts and runs | ✅ Works as a workaround |

For a clean cross-platform release, the most reliable path is **build
each OS on its own platform**. Cross-building from Mac to Windows is
possible but brittle.

## What's in the installer

A packed app ships:

```
Background Remover.app  (or Background Remover.exe + dlls on Win)
├── (Electron runtime, ~200 MB)
├── Resources/
│   ├── app.asar                 ← the JS bundle (main + preload + renderer)
│   ├── app.asar.unpacked/
│   │   └── node_modules/
│   │       ├── sharp/           ← native module
│   │       ├── @img/...         ← libvips DLLs + sharp-<os>-<arch>.node
│   │       └── onnxruntime-node/  ← all platforms (it bundles them)
│   ├── node-bin/
│   │   └── node (or node.exe)   ← sidecar Node 20.18.1, ~50 MB
│   ├── worker/
│   │   └── index.js             ← bundled worker entry
│   └── icon.icns / .ico
```

The model weights are **not** bundled — they download on first run to
the user's `userData/models/` (see [model.md](./model.md)). This
keeps the installer at ~350 MB instead of ~530 MB.

## One-time prerequisites on the build machine

| Need | macOS install | Windows install |
|---|---|---|
| Node 20+ | `brew install node@20` | nodejs.org installer |
| npm 10+ | comes with Node | comes with Node |
| `iconutil` (for .icns) | built-in on macOS | n/a |
| Wine (only for **cross-building** Windows on Mac) | `brew install --cask wine-stable` | n/a |

If you only build `.dmg` on Mac and `.exe` on Windows, **wine is not
needed**.

## Build recipes

### macOS `.dmg` (on a Mac, the easy path)

```bash
git clone <repo>
cd bgremover
npm install
npm run icons              # generate icon.icns (one-time, only re-run if you edit icon.svg)
npm run pack:mac
```

Output: `release/Background Remover-<version>-arm64.dmg`.

This single `pack:mac` script chains:

1. `prepare:cross-deps` — installs `@img/sharp-*` packages for all
   target platforms (idempotent — no-op if already present). The
   force flag bypasses npm's EBADPLATFORM rejection so the Windows
   bins also land in `node_modules/` for cross-building.
2. `fetch-node` — downloads Node 20.18.1 binaries for darwin-arm64,
   darwin-x64, win-x64 into `resources/node-binaries/` (idempotent).
3. `build` — runs electron-vite (main + preload + renderer) and the
   separate vite-worker build.
4. `electron-builder --mac --arm64` — produces the .dmg.

First run takes ~3 minutes (Electron framework download, ~100 MB).
Subsequent runs are ~1 minute (everything cached).

**Verified end-to-end on this machine**: open the .dmg, drag the app
to Applications, double-click. On first launch macOS Gatekeeper
blocks unsigned apps — instructions for the third party below.

### Windows `.exe` (on Windows — recommended)

```powershell
git clone <repo>
cd bgremover
npm install
npm run pack:win
```

Output: `release\Background Remover Setup <version>.exe` (NSIS
installer that lets the user pick install location).

On a fresh Windows checkout, `prepare:cross-deps` will install
`@img/sharp-darwin-arm64` (Mac bins) too — that's fine, they're a
small fraction of size and only sit in node_modules during build.

### Windows `.exe` cross-build (on Mac, needs wine)

If you don't have a Windows machine handy:

```bash
brew install --cask wine-stable
npm run pack:win
```

On **Apple Silicon Macs**, `wine-stable` from Homebrew is the arm64
build that runs natively. The one electron-builder downloads itself
(`wine-4.0.1-mac.7z`) is x86-only and crashes with `bad CPU type in
executable` on M-series machines — that's why we install via brew.

If wine isn't installed, electron-builder gets all the way through
producing `release/win-unpacked/Background Remover.exe` and its
dlls, then fails at the "set icon + version metadata" step. The
unpacked folder is fully functional — see the workaround below.

### Workaround: ship the unpacked Windows folder

If you really need a Windows distributable today and can't get wine
working:

```bash
npm run pack:win 2>/dev/null   # fails at NSIS but produces win-unpacked
cd release
zip -r "Background Remover-win-x64.zip" win-unpacked
```

The third party:
1. Downloads the .zip
2. Right-click → Extract All
3. Runs `Background Remover.exe` from the extracted folder

Same app, just no fancy installer wrapping. The main UX regression
is no Start menu shortcut.

## Distributing to a third party

Both builds are **unsigned** by design (see "Signing" below). Tell
the recipient:

### macOS

> 1. Open the `.dmg`, drag *Background Remover* to Applications.
> 2. The first time you launch the app, macOS will show
>    *"Background Remover can't be opened because Apple cannot
>    check it for malicious software"*. Click **Cancel**.
> 3. Open Finder, navigate to Applications, **right-click**
>    *Background Remover*, choose **Open**, then click **Open** in
>    the new dialog. macOS remembers the override — every
>    subsequent launch is silent.
> 4. The first batch will download the model weights (~180 MB).
>    After that the app is fully offline.

If macOS Sequoia (15) blocks even the right-click → Open path
(Gatekeeper is stricter there), the user must:

> 1. Go to **System Settings → Privacy & Security**.
> 2. Scroll to the bottom where it says
>    *"Background Remover was blocked from use because it is not
>    from an identified developer"*.
> 3. Click **Open Anyway**.

### Windows

> 1. Run the `.exe`. Windows SmartScreen will show
>    *"Windows protected your PC"*.
> 2. Click **More info** → **Run anyway**.
> 3. Pick install location, click Install.
> 4. The first batch will download the model weights (~180 MB).
>    After that the app is fully offline.

If shipping the unpacked-folder workaround, the third party extracts
the zip and runs `Background Remover.exe`; SmartScreen still
appears, same dismissal.

## Signing — current state, costs, when to add it

**Not signed.** Both installers and the executables inside trigger
the OS's "unidentified developer" warning. For internal distribution
this is acceptable; for external customers it's a friction point.

To productionise:

| Step | Cost | Effort |
|---|---|---|
| Apple Developer Program | $99 / year | Generate a Developer ID Application cert |
| Codesign + notarise (macOS) | — | Set `mac.identity` in `electron-builder.yml`, run `notarytool` after the .dmg builds |
| EV code-signing cert (Windows) | ~$300 / year | Buy from DigiCert/Sectigo. Set `win.certificateSubjectName` or use a hardware token |

The unsigned path stays valid until you ship to external customers.
Don't promise unsigned installers to people you don't know — even
benign Gatekeeper friction kills adoption.

## Reducing installer size

Current ~350 MB breakdown:

1. Electron runtime (~80 MB after compression)
2. `onnxruntime-node` (~120 MB across all platform shards)
3. Node sidecar binary (~50 MB)
4. `sharp` + libvips DLLs/dylibs (~10 MB per platform)
5. `@img/sharp-*` cross-platform bins shipped to both targets
   (~30 MB of dead weight per OS — Mac build contains the Win
   sharp + vice versa)

If size matters more than dev simplicity:

- **Restrict `asarUnpack`** in `electron-builder.yml` to only the
  target platform's `@img/sharp-<os>-<arch>` directory. Requires a
  conditional config per build target.
- **Drop unused `onnxruntime-node` execution providers**.
  CPU-only inference doesn't need the DirectML / CUDA shards
  bundled in the Windows packs (~80 MB savings).
- **Self-host the model** instead of downloading on first run.
  Saves the user a ~180 MB first-launch download but bloats the
  installer by the same amount.

None of these are MVP-critical.

## Config reference — `electron-builder.yml`

The current file is intentionally compact. Key bits:

```yaml
appId: com.tpp.bgremover
productName: Background Remover

extraResources:
  - from: resources/node-binaries/${os}-${arch}
    to: node-bin
  - from: out/worker
    to: worker

asar: true
asarUnpack:
  - "**/node_modules/sharp/**"
  - "**/node_modules/@img/**"
  - "**/node_modules/onnxruntime-node/**"

mac:
  target: [{ target: dmg, arch: [arm64] }]
  identity: null              # unsigned

win:
  target: [{ target: nsis, arch: [x64] }]
  icon: resources/icon.png    # electron-builder converts to .ico

nsis:
  oneClick: false              # let the user pick install location
  perMachine: false
  allowToChangeInstallationDirectory: true
```

`${os}-${arch}` expands to `mac-arm64` / `mac-x64` / `win-x64` — the
exact folder names our `fetch-node` script writes to.

`asarUnpack` patterns: native `.node` binaries can't be loaded from
inside an asar archive (Node's `dlopen` doesn't read asar). The
patterns above extract sharp + libvips + onnxruntime to
`app.asar.unpacked/` next to the asar so the sidecar can `require()`
them at runtime.

## Things that DON'T work yet

Audit findings from the most recent build attempt:

| Symptom | Cause | Fix |
|---|---|---|
| `bad CPU type in executable` during `pack:win` on Apple Silicon | electron-builder downloads a x86-only wine binary that can't run on M-series Macs | `brew install --cask wine-stable` (provides an arm64-native wine) |
| `EBADPLATFORM` when running `npm install` of cross-platform sharp packages | npm refuses to install a darwin-x64 binary on darwin-arm64 by default | `scripts/install-cross-deps.mjs` uses `npm install --no-save --include=optional --force` to bypass — already wired into `prepare:pack` |
| `release/` not in `.gitignore` (would commit huge installers) | already handled in `.gitignore` | (no action) |
| ~30 MB of "other platform" sharp bins in each installer | `asarUnpack: "**/node_modules/@img/**"` matches everything | future optimisation, not blocking |

## Quick check before you release

A pre-release sanity loop:

```bash
# 1. Lint everything
npm run typecheck
npm test
npm run test:coverage

# 2. Clean the previous build (optional but safer)
rm -rf out release

# 3. Build for the platform you're shipping
npm run pack:mac    # or pack:win on Windows

# 4. Smoke test on a clean machine
# - Open the .dmg / .exe
# - Right-click → Open (Mac) / More info → Run anyway (Win)
# - Trigger "Download model" → wait for completion → process a 5-image folder
```

The "clean machine" step is the only one that catches real
distribution bugs (path assumptions, missing native bins, etc).
Doing it in a VM is fine.
