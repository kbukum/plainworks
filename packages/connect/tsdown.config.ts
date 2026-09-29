import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `index` is the transport. Each other entry is one concern module, published as its own subpath
// (`@plainworks/connect/query`), so the import path names the concern.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    interceptor: "src/interceptor/index.ts",
    query: "src/query/index.ts",
    client: "src/client.ts",
  },
}

export default preset(build)
