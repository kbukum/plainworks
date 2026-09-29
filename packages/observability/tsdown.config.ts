import { preset } from "@plainworks/tsdown-config"

// `index` is the prelude (telemetry). Every other entry is one concern module, published as its own
// subpath (`@plainworks/observability/logging`), so the import path names the concern.
export default preset({
  entry: {
    index: "src/index.ts",
    logging: "src/logging/index.ts",
    reporting: "src/reporting/index.ts",
    vitals: "src/vitals/index.ts",
    client: "src/client.ts",
  },
})
