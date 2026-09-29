import { testConfig } from "@plainworks/vitest-config"

// Release-critical, so it holds a higher floor. `cli.ts` and `bun-tools.ts` bind the tested
// commands to the real process, disk, and Bun runtime.
export default testConfig({
  coverage: { threshold: 90, exclude: ["src/cli.ts", "src/pack/bun-tools.ts"] },
})
