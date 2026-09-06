import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    "client/supplied": "src/client/supplied.ts",
  },
})
