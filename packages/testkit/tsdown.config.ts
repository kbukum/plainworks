import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  // A DOM-only package: its render and Playwright harnesses drive a real or simulated DOM.
  dom: true,
  entry: {
    index: "src/index.ts",
    fakes: "src/fakes/index.ts",
    connect: "src/connect/index.ts",
    client: "src/client/index.ts",
    query: "src/query/index.ts",
    playwright: "src/playwright/index.ts",
  },
}

export default preset(build)
