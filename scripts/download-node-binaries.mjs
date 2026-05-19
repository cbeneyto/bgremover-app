#!/usr/bin/env node
/**
 * Download the Node.js LTS binary for each platform we ship and
 * stage it under `resources/node-binaries/<os>-<arch>/` so that
 * electron-builder's `extraResources` copies it into Resources/node-bin.
 *
 * The sidecar worker (`out/worker/index.js`) is then spawned with
 * this Node binary from the packaged app — completely decoupled
 * from Electron's bundled Node, so `sharp` / `onnxruntime-node`
 * prebuilts work without any ABI rebuilding.
 *
 * Run via `npm run fetch-node` before packaging.
 */

import { createHash } from "node:crypto"
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { pipeline } from "node:stream/promises"
import { spawnSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const NODE_VERSION = "v20.18.1"
const OUT_DIR = join(ROOT, "resources", "node-binaries")

// Map electron-builder ${os}-${arch} → Node release artifact.
const TARGETS = [
  {
    folder: "mac-arm64",
    archive: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
    binInside: `node-${NODE_VERSION}-darwin-arm64/bin/node`,
    outName: "node",
  },
  {
    folder: "mac-x64",
    archive: `node-${NODE_VERSION}-darwin-x64.tar.gz`,
    binInside: `node-${NODE_VERSION}-darwin-x64/bin/node`,
    outName: "node",
  },
  {
    folder: "win-x64",
    archive: `node-${NODE_VERSION}-win-x64.zip`,
    binInside: `node-${NODE_VERSION}-win-x64/node.exe`,
    outName: "node.exe",
  },
]

const DIST_BASE = `https://nodejs.org/dist/${NODE_VERSION}`

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return await res.text()
}

async function streamDownload(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  await pipeline(res.body, createWriteStream(destPath))
}

function sha256OfFile(file) {
  const buf = readFileSync(file)
  return createHash("sha256").update(buf).digest("hex")
}

async function loadShasums() {
  const text = await fetchText(`${DIST_BASE}/SHASUMS256.txt`)
  const map = new Map()
  for (const line of text.split("\n")) {
    const [hash, file] = line.trim().split(/\s+/)
    if (hash && file) map.set(file, hash)
  }
  return map
}

function extract(archivePath, intoDir) {
  if (archivePath.endsWith(".zip")) {
    // unzip is on macOS by default; on Linux/Win CI install it.
    const r = spawnSync("unzip", ["-q", archivePath, "-d", intoDir], {
      stdio: "inherit",
    })
    if (r.status !== 0) throw new Error("unzip failed")
  } else {
    const r = spawnSync("tar", ["-xzf", archivePath, "-C", intoDir], {
      stdio: "inherit",
    })
    if (r.status !== 0) throw new Error("tar failed")
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Fetching Node ${NODE_VERSION} binaries for sidecar…`)
  const shasums = await loadShasums()

  for (const t of TARGETS) {
    const outDir = join(OUT_DIR, t.folder)
    const finalPath = join(outDir, t.outName)
    if (existsSync(finalPath) && statSync(finalPath).size > 1024) {
      console.log(`  ✓ ${t.folder} (already present)`)
      continue
    }
    mkdirSync(outDir, { recursive: true })

    const tmp = await mkdtemp(join(tmpdir(), "node-bin-"))
    const archivePath = join(tmp, t.archive)
    const url = `${DIST_BASE}/${t.archive}`
    console.log(`  ↓ ${t.archive}`)
    await streamDownload(url, archivePath)

    const expectedHash = shasums.get(t.archive)
    if (!expectedHash) {
      throw new Error(`No SHASUMS entry for ${t.archive}`)
    }
    const actualHash = sha256OfFile(archivePath)
    if (actualHash !== expectedHash) {
      throw new Error(
        `Hash mismatch for ${t.archive}: ${actualHash} != ${expectedHash}`,
      )
    }
    extract(archivePath, tmp)
    const inside = join(tmp, t.binInside)
    if (!existsSync(inside)) {
      throw new Error(`Could not find ${t.binInside} after extracting ${t.archive}`)
    }
    renameSync(inside, finalPath)
    if (process.platform !== "win32" && t.outName === "node") {
      chmodSync(finalPath, 0o755)
    }
    rmSync(tmp, { recursive: true, force: true })
    console.log(`  ✓ ${t.folder} → ${finalPath}`)
  }

  // Drop a small marker so the worker tree exists even when no
  // platform-matching binary is present (avoids electron-builder
  // failing if a single target is built).
  await writeFile(
    join(OUT_DIR, "README.txt"),
    `Node ${NODE_VERSION} binaries staged here for sidecar packaging.\n`,
  )
  console.log("Done.")
}

main().catch((err) => {
  console.error("fatal:", err)
  process.exit(1)
})
