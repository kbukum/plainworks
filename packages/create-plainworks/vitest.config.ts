import { testConfig } from "@plainworks/vitest-config"

// `bin.ts` is the shebang entry and `cli/prompt.ts` the readline adapter; both only bind the
// tested `cli/execute.ts` to the real process. The `examples/` eject payload is proven by the
// generate-and-build smoke, not unit coverage.
export default testConfig({ coverage: { exclude: ["src/bin.ts", "src/cli/prompt.ts"] } })
