import { testConfig } from "@plainworks/vitest-config"

export default testConfig({
  coverage: {
    // The CLIs only bind argv and the real repo files to the tested functions.
    exclude: ["src/layer-map/cli.ts", "src/entries/cli.ts"],
  },
})
