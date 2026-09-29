import { testConfig } from "@plainworks/vitest-config"

export default testConfig({
  coverage: {
    // The layer-map CLI only binds argv and the real repo files to the tested sync functions.
    exclude: ["src/layer-map/cli.ts"],
  },
})
