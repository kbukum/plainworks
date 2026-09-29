import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    connect: "src/connect/index.ts",
    client: "src/client/index.ts",
    browser: "src/browser/index.ts",
  },
}

export default preset(build)
