import { testConfig } from "@plainworks/vitest-config"

// `cli.ts` binds the tested command to the real process and disk.
export default testConfig({ coverage: { exclude: ["src/cli.ts"] } })
