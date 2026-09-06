import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Always `node`: the server-safe `.` entry must prove it needs no DOM. Client tests opt into
    // jsdom per file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Re-export-only barrels carry no logic to unit-test (the `"use client"` directive's survival
      // is proven by the CI dist check, not coverage); excluding them keeps tests from coupling to
      // the entry file just to color a line.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/index.ts",
        "src/client.ts",
        "src/client/supplied.ts",
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
