#!/usr/bin/env node
/**
 * Install the platform-specific native packages for `sharp` so a
 * single `npm` checkout can build installers for every target OS.
 *
 * Why this is needed: `sharp` ships its native libvips bindings as
 * separate `@img/sharp-<os>-<arch>` optional-dependency packages.
 * A plain `npm install` only fetches the package matching the
 * current host (darwin-arm64 on Apple Silicon, win32-x64 on a
 * Windows runner, etc.). To produce a Windows .exe from a Mac, the
 * Windows native bins need to live in `node_modules/@img/` at
 * pack time — otherwise `electron-builder` ends up shipping a
 * `sharp` that crashes on import on the target machine.
 *
 * What we do: explicit `npm install --no-save` calls scoped to the
 * exact target packages. `--no-save` keeps package.json untouched
 * (the canonical install logic remains "pick the host's bins on
 * `npm install`"). Idempotent — re-running just no-ops if the
 * packages are already there.
 *
 * Each `npm install` call is awaited sequentially because npm is
 * not safe to run in parallel against the same `node_modules`.
 */

import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")

const SHARP_VERSION = "0.34.5"
const LIBVIPS_VERSION = "1.2.4"

/**
 * Mapping of target → packages that need to exist under
 * `node_modules/@img/` for that build to succeed.
 *
 * Linux is unused right now (no installer target) but documented
 * in case we ever add one.
 */
const TARGETS = {
  "mac-arm64": {
    os: "darwin",
    cpu: "arm64",
    packages: [
      `@img/sharp-darwin-arm64@${SHARP_VERSION}`,
      `@img/sharp-libvips-darwin-arm64@${LIBVIPS_VERSION}`,
    ],
  },
  "mac-x64": {
    os: "darwin",
    cpu: "x64",
    packages: [
      `@img/sharp-darwin-x64@${SHARP_VERSION}`,
      `@img/sharp-libvips-darwin-x64@${LIBVIPS_VERSION}`,
    ],
  },
  "win-x64": {
    os: "win32",
    cpu: "x64",
    packages: [
      `@img/sharp-win32-x64@${SHARP_VERSION}`,
      `@img/sharp-libvips-win32-x64@${LIBVIPS_VERSION}`,
    ],
  },
}

function pkgInstalled(name) {
  // name = "@img/sharp-win32-x64@0.34.5" → folder is @img/sharp-win32-x64
  const bare = name.replace(/@\d.*$/, "")
  return existsSync(join(ROOT, "node_modules", bare))
}

const arg = process.argv[2] ?? "all"
const targets =
  arg === "all"
    ? Object.keys(TARGETS)
    : [arg].filter((t) => t in TARGETS)

if (targets.length === 0) {
  console.error(`Unknown target: ${arg}`)
  console.error(`Valid: ${Object.keys(TARGETS).join(", ")}, or "all"`)
  process.exit(1)
}

console.log("Installing cross-platform native deps for:", targets.join(", "))

// Gather all the packages we want across every requested target.
// We install in a SINGLE `npm install` call: separate calls would
// each prune the previous platform's `@img/sharp-*` packages out of
// node_modules (npm sees them as non-matching optional deps). One
// big install keeps them all in place.
const allPackages = [
  ...new Set(targets.flatMap((t) => TARGETS[t].packages)),
]
const allMissing = allPackages.filter((p) => !pkgInstalled(p))

if (allMissing.length === 0) {
  console.log("\nNothing to do — all packages already present.")
  process.exit(0)
}

console.log("\nMissing:", allMissing.join(", "))

// `--force` is the magic flag that bypasses npm's EBADPLATFORM
// rejection. Without it, npm refuses to install a sharp-win32-x64
// binary on a Mac because the package's own `os`/`cpu` manifest
// fields don't match the host. We *want* those bytes in
// node_modules anyway so electron-builder can copy them into the
// Windows installer at pack time.
const r = spawnSync(
  "npm",
  [
    "install",
    "--no-save",
    "--include=optional",
    "--force",
    ...allMissing,
  ],
  { cwd: ROOT, stdio: "inherit" },
)
if (r.status !== 0) {
  console.error("\nnpm install failed.")
  process.exit(1)
}

console.log("\nDone.")
