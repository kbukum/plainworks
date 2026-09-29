import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    "client/scope": "src/client/scope/index.ts",
    "client/supplied": "src/client/supplied.ts",
  },
}

export default preset(build)
