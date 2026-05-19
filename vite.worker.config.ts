/**
 * Standalone Vite config for the sidecar worker. Not part of the
 * electron-vite build because the worker is a vanilla-Node process,
 * not an Electron one.
 *
 * Output: `out/worker/index.js` — copied into the packaged app by
 * electron-builder's `extraResources` block and spawned by
 * `worker-bridge.ts` at runtime.
 */

import { defineConfig } from "vite"
import { resolve } from "node:path"

const NATIVE_EXTERNALS = [
  "@huggingface/transformers",
  "sharp",
  "onnxruntime-node",
  // Node built-ins handled by `nodeBuiltins` below.
]

export default defineConfig({
  build: {
    target: "node20",
    outDir: "out/worker",
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, "src/worker/index.ts"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: [
        ...NATIVE_EXTERNALS,
        /^node:/,
        "fs",
        "fs/promises",
        "path",
        "os",
        "readline",
        "child_process",
        "stream",
        "stream/promises",
        "crypto",
        "util",
        "url",
        "events",
      ],
      output: {
        format: "cjs",
        entryFileNames: "index.js",
      },
    },
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
})
