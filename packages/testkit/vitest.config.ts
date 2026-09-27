import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Always `node`: the server-safe `.` entry must prove it needs no DOM. Client tests opt into
    // jsdom per file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    // DOM tests that run axe and user-event can pass 5 s on a busy CI runner. The tests are
    // deterministic, so the longer limit only guards against a hang; it never hides a failure.
    testTimeout: 15_000,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Re-export-only barrels carry no logic to unit-test (the `"use client"` directive's survival
      // is proven by the CI dist check, not coverage); excluding them keeps tests from coupling to
      // the entry file just to color a line. Generated protobuf output is excluded as vendored
      // code. The browser modules listed below drive a live Playwright page, which Vitest cannot
      // host; their pure parts keep unit tests, and both reference hosts' browser suites run them
      // end to end.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "src/client.ts",
        "src/connect/gen/**",
        "src/browser/{animation,axe,focus,gate,layout,surface}.ts",
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
