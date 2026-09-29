import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    "capabilities/auth": "src/capabilities/auth.ts",
    "capabilities/query": "src/capabilities/query.ts",
    "capabilities/state": "src/capabilities/state.ts",
    testing: "src/testing.ts",
  },
}

export default preset(build)
