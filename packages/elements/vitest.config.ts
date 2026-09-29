import { testConfig } from "@plainworks/vitest-config"
import { mergeConfig } from "vitest/config"

const source = (path: string): string => new URL(path, import.meta.url).pathname

// The registry pipeline under `scripts/` is code this package authors, so it is tested and
// measured too; `shadcn.ts` spawns the network-bound shadcn CLI and `cli.ts` is the maintainer-run
// bin, so neither is measured. Vendored atoms are upstream code, proven by the accessibility
// gallery and the declaration typecheck rather than line coverage.
export default mergeConfig(
  testConfig({
    include: ["scripts/**/*.test.ts"],
    coverage: {
      include: ["scripts/**/*.ts"],
      exclude: ["src/shadcn/**", "scripts/registry/shadcn.ts", "scripts/registry/cli.ts"],
    },
  }),
  {
    // `@/` resolves atom siblings the way the vendored atoms import them.
    resolve: { alias: { "@/": source("./src/") } },
  },
)
