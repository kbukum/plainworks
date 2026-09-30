import { type PackageBuild, preset } from "@plainworks/tsdown-config"

export const build: PackageBuild = {
  // A DOM-only package: its inspector dock renders into the browser DOM.
  dom: true,
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    bridge: "src/bridge/index.ts",
    privacy: "src/privacy/index.ts",
    retention: "src/retention/index.ts",
    session: "src/session/index.ts",
    store: "src/store/index.ts",
    launch: "src/launch/index.ts",
    query: "src/adapters/query/index.ts",
    state: "src/adapters/state/index.ts",
    http: "src/adapters/http/index.ts",
    connect: "src/adapters/connect/index.ts",
    channel: "src/adapters/channel/index.ts",
    observability: "src/adapters/observability/index.ts",
  },
  // The panel's scoped stylesheet is compiled by `scripts/styles` after tsdown, in `build`.
  assets: { "styles.css": { generatedBy: "scripts/styles/cli.ts" } },
}

export default preset(build)
