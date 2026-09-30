import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    hydration: "src/hydration/index.ts",
    "capabilities/auth": "src/capabilities/auth/index.ts",
    "capabilities/http": "src/capabilities/http.ts",
    "capabilities/query": "src/capabilities/query.ts",
    "capabilities/state": "src/capabilities/state.ts",
    "capabilities/theme": "src/capabilities/theme/index.ts",
    testing: "src/testing.ts",
  },
}

export default preset(build)
