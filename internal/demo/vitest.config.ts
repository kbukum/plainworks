import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // The demo domain and its msw/node server harness run in Node — no DOM.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Barrels carry no testable logic.
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
