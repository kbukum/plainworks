import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      // The published per-atom subpaths resolve to owned source so an adoption test can prove the
      // exports map, and the shadcn `@/` alias resolves siblings the way the atoms import them.
      "@plainworks/elements/button": new URL("./src/shadcn/button.tsx", import.meta.url).pathname,
      "@plainworks/elements/card": new URL("./src/shadcn/card.tsx", import.meta.url).pathname,
      "@plainworks/elements/input": new URL("./src/shadcn/input.tsx", import.meta.url).pathname,
      "@/": new URL("./src/", import.meta.url).pathname,
    },
  },
  test: {
    // Always `node`: the server-safe `.` manifest must prove it needs no DOM. Client tests opt into
    // jsdom per file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    // DOM tests that run axe and user-event can pass 5 s on a busy CI runner. The tests are
    // deterministic, so the longer limit only guards against a hang; it never hides a failure.
    testTimeout: 15_000,
    // The registry ingestion pipeline is dev-only TypeScript tooling under `scripts/`, run with
    // bun; its tests live beside it rather than in the shipped `src/` graph.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // The ingestion pipeline under `scripts/` is the code this package authors, so it is
      // measured alongside `src/` — not left to run tested-but-unmeasured.
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
      // Re-export-only barrels carry no logic to unit-test. Vendored shadcn atoms under `shadcn/`
      // are upstream code verified by the accessibility gallery and the declaration-emit
      // typecheck, not by per-line unit coverage. `shadcn.ts` is the
      // network-bound ingestion seam (maintainer-run); the pipeline tests inject a fake `pull` so
      // they stay offline, so its spawn path is not unit-measured — like a barrel. All are excluded
      // so coverage measures only the offline logic this package authors.
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        "src/shadcn/**",
        "scripts/**/*.test.ts",
        "scripts/registry/shadcn.ts",
        "scripts/registry/cli.ts",
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
