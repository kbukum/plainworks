import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    "error-fallback": "src/client/components/error-fallback/index.ts",
    "theme-client": "src/client/theme/index.ts",
  },
})
