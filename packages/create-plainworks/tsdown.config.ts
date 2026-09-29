import { type CliBuild, cliPreset } from "@plainworks/tsdown-config"

// The initializer is a Node executable, not an importable library: it bundles to one
// self-contained command and ships the generated `examples/` eject payload verbatim.
export const build: CliBuild = {
  bin: { "create-plainworks": "src/bin.ts" },
  files: ["examples"],
}

export default cliPreset(build)
