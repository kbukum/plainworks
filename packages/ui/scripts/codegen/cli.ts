import { runCodegen } from "./manifest"

// Dev-only entry for `bun run --filter @plainworks/ui codegen`. Regenerates registry.json, the
// tsdown entry map, and the package exports and files from disk.
runCodegen()
process.stdout.write(
  "ui codegen: wrote registry.json, tsdown.config.ts, and package exports and files\n",
)
