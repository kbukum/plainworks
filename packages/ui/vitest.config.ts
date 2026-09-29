import { testConfig } from "@plainworks/vitest-config"

// The codegen under `scripts/` is code this package authors, so it is tested and measured too.
// `cli.ts` is the maintainer-run bin and `format.ts` shells out to Biome, so neither is measured.
export default testConfig({
  include: ["scripts/**/*.test.ts"],
  coverage: {
    include: ["scripts/**/*.ts"],
    exclude: ["scripts/codegen/cli.ts", "scripts/codegen/format.ts"],
  },
})
