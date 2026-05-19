#!/usr/bin/env node
/**
 * Generate the platform icons for electron-builder from a single SVG.
 *
 * What gets produced:
 *   - resources/icon.png    (1024×1024 — universal source, also used
 *     as the dev BrowserWindow icon)
 *   - resources/icon.icns   (macOS — built via `iconutil` on darwin)
 *   - resources/icon.ico    (Windows — left to electron-builder to
 *     generate from icon.png at pack time; producing a 16-256 px ico
 *     here would require a Windows-only tool)
 *
 * Why we don't ship pre-built .icns in the repo: it's a binary blob
 * that's auto-derivable from the SVG. Anyone changing the brand mark
 * just edits resources/icon.svg and re-runs this script.
 *
 * Usage:  npm run icons
 */

import sharp from "sharp"
import { mkdirSync, rmSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const SRC = join(ROOT, "resources", "icon.svg")
const OUT_DIR = join(ROOT, "resources")
const PNG = join(OUT_DIR, "icon.png")
const ICONSET = join(OUT_DIR, "icon.iconset")
const ICNS = join(OUT_DIR, "icon.icns")

const ICONSET_SIZES = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
]

async function main() {
  if (!existsSync(SRC)) {
    console.error(`Missing source SVG: ${SRC}`)
    process.exit(1)
  }

  console.log("Generating icon.png (1024×1024) …")
  await sharp(SRC, { density: 384 })
    .resize(1024, 1024, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(PNG)

  if (process.platform === "darwin") {
    console.log("Building macOS .iconset …")
    if (existsSync(ICONSET)) rmSync(ICONSET, { recursive: true, force: true })
    mkdirSync(ICONSET, { recursive: true })
    for (const { name, size } of ICONSET_SIZES) {
      await sharp(SRC, { density: 384 })
        .resize(size, size, { fit: "contain" })
        .png({ compressionLevel: 9 })
        .toFile(join(ICONSET, name))
    }
    console.log("Running iconutil …")
    const r = spawnSync(
      "iconutil",
      ["-c", "icns", ICONSET, "-o", ICNS],
      { stdio: "inherit" },
    )
    if (r.status !== 0) {
      console.error("iconutil failed — leaving icon.png as the build source.")
      process.exit(0) // not fatal; electron-builder can fall back to .png
    }
    rmSync(ICONSET, { recursive: true, force: true })
    console.log(`Wrote ${ICNS}`)
  } else {
    console.log(
      "Skipping .icns (only buildable on macOS). electron-builder will use icon.png on this platform.",
    )
  }

  console.log("Done.")
}

main().catch((err) => {
  console.error("fatal:", err)
  process.exit(1)
})
