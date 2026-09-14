import { runCodegen } from "./manifest.mjs"

// Dev-only entry for `bun run --filter @plainworks/ui codegen`. Regenerates the atom re-export
// shims, registry.json, the tsdown entry map, and the package exports from disk, then reports the
// atom set it wrote so a maintainer sees the surface without diffing four files.
const atoms = runCodegen()
console.log(`ui codegen: wrote ${atoms.length} atom re-exports [${atoms.join(", ")}]`)
