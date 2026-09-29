import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `index` is the channel lifecycle. Each other entry is one concern module, published as its own
// subpath (`@plainworks/channel/transport`), so the import path names the concern.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    events: "src/events/index.ts",
    transport: "src/transport/index.ts",
    client: "src/client.ts",
  },
}

export default preset(build)
