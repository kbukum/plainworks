// Build-time eject: regenerate the shipped example payload from the real source apps. For each host,
// eject its `apps/*` source app into `examples/<host>` — the self-contained project the published
// CLI copies and pins at scaffold time. The apps are the single source of truth; `examples/` is
// generated (gitignored) output, rebuilt on every `build` before `tsdown` bundles the CLI. Run under
// bun so it can import the TypeScript eject transform directly.
//
// Run: `bun scripts/bundle-examples.mjs` (invoked by `bun run build`).

import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { bundleExample } from "../src/eject/bundle"
import { EXAMPLE_SOURCE_APPS } from "../src/eject/config"

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(dirname(packageDir))
const appsDir = join(repoRoot, "apps")
const examplesDir = join(packageDir, "examples")

for (const [host, app] of Object.entries(EXAMPLE_SOURCE_APPS)) {
  const appDir = join(appsDir, app)
  const destDir = join(examplesDir, host)
  bundleExample({ appDir, destDir, repoRoot })
  console.log(`ejected apps/${app} -> examples/${host}`)
}
