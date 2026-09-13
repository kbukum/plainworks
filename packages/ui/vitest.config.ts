import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@plainworks/ui/error-fallback": new URL(
        "./src/client/components/error-fallback/index.ts",
        import.meta.url,
      ).pathname,
      "@plainworks/ui/theme": new URL("./src/client/theme/index.ts", import.meta.url).pathname,
      "@plainworks/elements/button": new URL("../elements/src/atoms/button.tsx", import.meta.url)
        .pathname,
      "@plainworks/elements/card": new URL("../elements/src/atoms/card.tsx", import.meta.url)
        .pathname,
    },
  },
  test: {
    // Always `node`: the server-safe `.` entry must prove it needs no DOM. Client tests opt into
    // jsdom per file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Re-export-only barrels carry no logic to unit-test (the `"use client"` directive's survival
      // is proven by the CI dist check, not coverage); excluding every `index.ts` barrel keeps
      // tests from coupling to a re-export file just to color a line.
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts", "src/client.ts"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
