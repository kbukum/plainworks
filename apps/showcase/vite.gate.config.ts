import { readdirSync } from "node:fs"
import { defineConfig, mergeConfig } from "vite"
import base from "./vite.config.ts"

// The browser gate's build: the app and its E2E fixture pages, bundled once per run so the shared
// gate host serves a few files per page instead of transforming hundreds of modules for every new
// browser context. `e2e/support/gate-host.ts` runs it with `NODE_ENV=development`, which keeps
// React's development checks (hydration warnings) and the devtools inspector the gate proves; the
// production bundle is proven by `check-production` and the hosts smoke job. It also names the
// output folder in `SHOWCASE_BUILD_DIR`, one per run's port, so side-by-side runs never empty
// each other's bundle.
const buildDir = process.env.SHOWCASE_BUILD_DIR
if (buildDir === undefined || buildDir === "") {
  throw new Error("vite.gate.config.ts: set SHOWCASE_BUILD_DIR (e2e/support/gate-host.ts does).")
}

const fixturePages = readdirSync(new URL("./e2e/fixtures/", import.meta.url))
  .filter((name) => name.endsWith(".html"))
  .map((name) => `e2e/fixtures/${name}`)

export default defineConfig(({ isSsrBuild }) =>
  mergeConfig(
    base,
    isSsrBuild
      ? {
          build: {
            outDir: `${buildDir}/server`,
            emptyOutDir: true,
          },
        }
      : {
          build: {
            outDir: `${buildDir}/client`,
            emptyOutDir: true,
            manifest: true,
            rolldownOptions: {
              input: ["src/client/entry-client.tsx", "src/client/styles.css", ...fixturePages],
            },
          },
        },
  ),
)
