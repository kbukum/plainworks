import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  // A DOM-only package: its render and browser harnesses drive a real or simulated DOM.
  dom: true,
  entry: {
    index: "src/index.ts",
    connect: "src/connect/index.ts",
    client: "src/client/index.ts",
    browser: "src/browser/index.ts",
  },
}

export default preset(build)
