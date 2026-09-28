import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // The neutral entry must prove it needs no DOM.
    environment: "node",
    // DOM tests that run axe and user-event can pass 5 s on a busy CI runner. The tests are
    // deterministic, so the longer limit only guards against a hang; it never hides a failure.
    testTimeout: 15_000,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "fixtures/**/*.test.ts",
      "scripts/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      // The stylesheet build under `scripts/` is code this package authors, so it is covered too.
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      // Re-export-only barrels carry no logic to unit-test.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "scripts/**/*.test.ts",
        // The CLI only wires the pipeline to the filesystem; the build and fixtures exercise it.
        "scripts/styles/cli.ts",
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
