import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    client: "src/client.ts",
    "form-post": "src/adapters/form-post.ts",
  },
}

export default preset(build)
