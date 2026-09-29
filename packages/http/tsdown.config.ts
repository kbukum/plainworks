import { preset } from "@plainworks/tsdown-config"

// `index` is the fetch client. Each other entry is one concern module, published as its own subpath
// (`@plainworks/http/list`), so the import path names the concern.
export default preset({
  entry: {
    index: "src/index.ts",
    interceptor: "src/interceptor/index.ts",
    list: "src/list/index.ts",
  },
})
