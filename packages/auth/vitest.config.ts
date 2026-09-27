import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Always `node`: the server-safe `.` entry must prove it needs no DOM.
    environment: "node",
    // DOM tests that run axe and user-event can pass 5 s on a busy CI runner. The tests are
    // deterministic, so the longer limit only guards against a hang; it never hides a failure.
    testTimeout: 15_000,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      // Re-export-only barrels carry no logic to unit-test; `server.ts`/`client.ts` are entry
      // barrels like `index.ts` (their surface is proven by the dist check, not coverage).
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts", "src/server.ts", "src/client.ts"],
      // Security-load-bearing package: hold the higher coverage floor.
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
})
