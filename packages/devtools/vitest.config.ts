import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // The neutral entry must prove it needs no DOM.
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "fixtures/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    coverage: {
      provider: "v8",
      // The stylesheet build under `scripts/` is code this package authors, so it is covered too.
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
      // Re-export-only barrels carry no logic to unit-test.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "scripts/**/*.test.mjs",
        // The CLI only wires the pipeline to the filesystem; the build and fixtures exercise it.
        "scripts/styles/cli.mjs",
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
