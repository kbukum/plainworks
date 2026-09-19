import { defineConfig } from "vitest/config"

// The CLI runs on Node and touches the filesystem, so its unit tests run in the `node` environment
// against a temp directory. `examples/` is generated eject payload, not CLI logic, so it is
// excluded from the coverage graph (it is proven by the generate-and-build CI smoke, not unit
// coverage).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/index.ts",
        "src/index.ts",
        // Thin shebang executable entry; the orchestration seam lives in `src/cli/execute.ts` and
        // is covered by unit tests.
        "src/bin.ts",
        // Thin readline IO adapter — no logic to unit-test.
        "src/cli/prompt.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
