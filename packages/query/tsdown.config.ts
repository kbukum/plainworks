import { preset } from "@plainworks/tsdown-config"

// `index` is the prelude (the query client). Every other entry is one concern module, published as
// its own subpath (`@plainworks/query/cache`), so the import path names the concern.
export default preset({
  entry: {
    index: "src/index.ts",
    cache: "src/cache/index.ts",
    hydration: "src/hydration/index.ts",
    list: "src/list/index.ts",
    remote: "src/remote/index.ts",
    client: "src/client.ts",
  },
})
