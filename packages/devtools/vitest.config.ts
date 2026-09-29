import { testConfig } from "@plainworks/vitest-config"

// The scoped stylesheet build under `scripts/` is code this package authors, so it is tested and
// measured too; its CLI only wires the pipeline to the filesystem. `fixtures/` holds the host
// fixtures whose tests prove the stylesheet stays scoped.
export default testConfig({
  include: ["fixtures/**/*.test.ts", "scripts/**/*.test.ts"],
  coverage: { include: ["scripts/**/*.ts"], exclude: ["scripts/styles/cli.ts"] },
})
