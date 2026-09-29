import { runCodegen } from "./manifest"

// Dev-only entry for `bun run --filter @plainworks/ui codegen`. Regenerates registry.json and the
// tsdown build description from disk; `bun run sync-shape` then refreshes the package exports.
runCodegen()
process.stdout.write("ui codegen: wrote registry.json and tsdown.config.ts\n")
