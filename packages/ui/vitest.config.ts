import { defineConfig } from "vitest/config"

// Atoms resolve through their published `@plainworks/elements/<atom>` subpaths to the built
// package (turbo builds it first), exactly as a consumer sees them.
export default defineConfig({
  test: {
    // Always `node`: the server-safe `.` entry must prove it needs no DOM. Client tests opt into
    // jsdom per file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    // The disk→public-API codegen is dev-only `.mjs` tooling under `scripts/`; its tests live
    // beside it rather than in the shipped `src/` graph.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
    coverage: {
      provider: "v8",
      // The `.mjs` codegen under `scripts/` is code this package authors, so it is measured
      // alongside `src/` — not left to run tested-but-unmeasured.
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.mjs"],
      // Re-export-only barrels carry no logic to unit-test (the `"use client"` directive's survival
      // is proven by the CI dist check, not coverage); excluding every `index.ts` barrel keeps
      // tests from coupling to a re-export file just to color a line. `cli.mjs` is the
      // maintainer-run bin and `format.mjs` shells to Biome, so neither is unit-measured.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "src/client.ts",
        "scripts/**/*.test.mjs",
        "scripts/codegen/cli.mjs",
        "scripts/codegen/format.mjs",
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
