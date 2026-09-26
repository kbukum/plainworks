import { runCodegen } from "./manifest.mjs"

// Dev-only entry for `bun run --filter @plainworks/ui codegen`. Regenerates registry.json, the
// tsdown entry map, and the package exports and files from disk.
runCodegen()
console.log("ui codegen: wrote registry.json, tsdown.config.ts, and package exports and files")
