import { type PackageBuild, preset } from "@plainworks/tsdown-config"

// `index` is the prelude (errors, results, guards). Every other entry is one concern module,
// published as its own subpath (`@plainworks/std/web`), so the import path names the concern.
export const build: PackageBuild = {
  entry: {
    index: "src/index.ts",
    emitter: "src/emitter/index.ts",
    encoding: "src/encoding/index.ts",
    list: "src/list/index.ts",
    pipeline: "src/pipeline/index.ts",
    privacy: "src/privacy/index.ts",
    random: "src/random/index.ts",
    resilience: "src/resilience/index.ts",
    seam: "src/seam/index.ts",
    time: "src/time/index.ts",
    web: "src/web/index.ts",
  },
}

export default preset(build)
