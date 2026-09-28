import { defineConfig } from "vitest/config"

// Atoms resolve through their published `@plainworks/elements/<atom>` subpaths to the built
// package (turbo builds it first), exactly as a consumer sees them.
export default defineConfig({
  test: {
    // Always `node`: the server-safe `.` entry must prove it needs no DOM. Client tests opt into
    // jsdom per file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    // DOM tests that run axe and user-event can pass 5 s on a busy CI runner. The tests are
    // deterministic, so the longer limit only guards against a hang; it never hides a failure.
    testTimeout: 15_000,
    // The disk→public-API codegen is dev-only TypeScript tooling under `scripts/`, run with bun;
    // its tests live beside it rather than in the shipped `src/` graph.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The codegen under `scripts/` is code this package authors, so it is measured
      // alongside `src/` — not left to run tested-but-unmeasured.
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      // Re-export-only barrels carry no logic to unit-test (the `"use client"` directive's survival
      // is proven by the CI dist check, not coverage); excluding every `index.ts` barrel keeps
      // tests from coupling to a re-export file just to color a line. `cli.ts` is the
      // maintainer-run bin and `format.ts` shells to Biome, so neither is unit-measured.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "src/client.ts",
        "scripts/**/*.test.ts",
        "scripts/codegen/cli.ts",
        "scripts/codegen/format.ts",
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
