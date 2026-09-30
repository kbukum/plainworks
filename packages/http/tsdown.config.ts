import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `index` is the fetch client. Each other entry is one concern module, published as its own subpath
// (`@plainworks/http/list`), so the import path names the concern. `client` is the React binding.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    interceptor: "src/interceptor/index.ts",
    list: "src/list/index.ts",
    client: "src/client.ts",
  },
}

export default preset(build)
