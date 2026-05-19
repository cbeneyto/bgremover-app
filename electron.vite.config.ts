import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"

/**
 * electron-vite splits the build into three trees: main, preload,
 * renderer. We add a fourth manually-driven build for the sidecar
 * worker (see `npm run build:worker`) because electron-vite only
 * groks the three Electron processes.
 *
 * `external` lists native/runtime deps that must stay outside the
 * Vite bundle — they get resolved from node_modules at runtime by
 * the spawned worker / main process.
 */
const NATIVE_EXTERNALS = [
  "electron",
  "@huggingface/transformers",
  "sharp",
  "exceljs",
  "papaparse",
  "onnxruntime-node",
]

export default defineConfig({
  main: {
    build: {
      outDir: "out/main",
      lib: {
        entry: "src/main/index.ts",
        formats: ["cjs"],
      },
      rollupOptions: {
        external: NATIVE_EXTERNALS,
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  preload: {
    build: {
      outDir: "out/preload",
      lib: {
        entry: "src/preload/index.ts",
        formats: ["cjs"],
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
  },
  renderer: {
    root: "src/renderer",
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "src/shared"),
      },
    },
    plugins: [react()],
  },
})
