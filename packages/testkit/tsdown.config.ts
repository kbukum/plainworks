import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: {
    index: "src/index.ts",
    "connect/index": "src/connect/index.ts",
    "client/index": "src/client/index.ts",
  },
})
