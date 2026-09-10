import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    "capabilities/auth": "src/capabilities/auth.ts",
    "capabilities/query": "src/capabilities/query.ts",
    "capabilities/state": "src/capabilities/state.ts",
    testing: "src/testing.ts",
  },
})
