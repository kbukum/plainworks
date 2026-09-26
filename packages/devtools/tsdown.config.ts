import { preset } from "@plainworks/tsdown-config"

export default preset({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    query: "src/adapters/query/index.ts",
    state: "src/adapters/state/index.ts",
    http: "src/adapters/http/index.ts",
    connect: "src/adapters/connect/index.ts",
    channel: "src/adapters/channel/index.ts",
    observability: "src/adapters/observability/index.ts",
  },
})
