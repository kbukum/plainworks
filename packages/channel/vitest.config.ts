import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Always `node`: the server-safe `.` entry (core + transports) must prove it needs no DOM. Client
    // hook tests opt into jsdom per file via a `// @vitest-environment jsdom` docblock.
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
        "src/**/index.ts",
        "src/client.ts",
        // Test-only harness (never shipped) and type-only seams (erase at build; no runtime to cover).
        "src/transport/fake-transport.ts",
        "src/transport/transport.ts",
        "src/events/sink.ts",
        "src/adapter/webtransport/interface.ts",
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
