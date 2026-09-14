import { defineConfig } from "vitest/config"

// The owned atoms are consumed through their published `@plainworks/elements/<atom>` subpaths; one
// regex alias resolves every one of them to elements source so ui tests run against live atom code
// without either package being built first, and a new composite needs no config edit to import a
// new atom.
const elementsAtoms = new URL("../elements/src/atoms/", import.meta.url).pathname
const elementsSrc = new URL("../elements/src/", import.meta.url).pathname

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@plainworks\/elements\/(.+)$/, replacement: `${elementsAtoms}$1.tsx` },
      // Resolved atoms import their siblings through the shadcn `@/` alias; map it to elements
      // source so those internal imports resolve when ui renders an atom in a test.
      { find: /^@\/(.*)$/, replacement: `${elementsSrc}$1` },
    ],
  },
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
      // tests from coupling to a re-export file just to color a line. The generated atom shims
      // under `client/atoms/` are re-export-only too — lock-step-verified, not unit-measured.
      // `cli.mjs` is the maintainer-run bin and `format.mjs` shells to Biome, so neither is
      // unit-measured.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "src/client.ts",
        "src/client/atoms/**",
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
