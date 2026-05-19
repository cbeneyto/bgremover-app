import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

/**
 * Unit-test config. Same philosophy as the tpp-ops vitest setup:
 *
 *   - Pure functions only. Anything touching `fs`, `child_process`,
 *     Electron, or the network either gets extracted to a pure core
 *     or is skipped this pass. No mocks.
 *   - Tests colocate with source (`foo.ts` → `foo.test.ts`).
 *   - TZ=UTC is set by the npm scripts so any Intl/Date output is
 *     reproducible across CI and dev laptops.
 *
 * Coverage threshold is enforced **only on the files actually
 * imported by tests**. We don't gate the renderer (React UI),
 * Electron bootstrap (main/index.ts, worker/index.ts), or the
 * native-binary spawn code — those are exercised by manual smoke
 * tests, not units. See docs/testing.md for the rationale.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "html"],
      // Only files explicitly listed here are subject to the coverage
      // gate. Everything else is reported but not enforced.
      include: [
        "src/shared/create-store.ts",
        "src/shared/jsonl.ts",
        "src/shared/theme-resolver.ts",
        "src/main/input-resolver.ts",
        "src/worker/url-rewrite.ts",
        "src/worker/mask-postprocess.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
