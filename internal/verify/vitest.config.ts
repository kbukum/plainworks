import { testConfig } from "@plainworks/vitest-config"

// Release-critical, so it holds a higher floor. `cli.ts` only binds the tested runner to real
// child processes.
export default testConfig({ coverage: { threshold: 90, exclude: ["src/cli.ts"] } })
