// Regenerate one app's Linux screenshot baselines inside the Playwright image CI runs, so they match
// CI pixel for pixel. The working tree is copied into the container (host `node_modules`, `.git`,
// and `tmp/` never leak in), the app's workspace dependencies are built, changed or missing
// `@visual` baselines are written, and a second run proves they are stable. Only the `linux`
// baseline folders are copied back.
//
//   node scripts/e2e-linux.mjs <app> [playwright args]   e.g. node scripts/e2e-linux.mjs showcase
//
// It emulates `linux/amd64`, the CI runner's architecture, unless `E2E_LINUX_PLATFORM` names
// another. Delete an app's `linux` folders first to regenerate every baseline from scratch.

import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

// The image `.github/workflows/ci.yml` runs the browser gate in; keep the two digests identical.
const IMAGE =
  "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27"
const BUN_VERSION = "1.3.6"
const APPS = ["showcase", "next-host"]

const [app, ...playwrightArgs] = process.argv.slice(2)
if (app === undefined || !APPS.includes(app)) {
  process.stderr.write(`Usage: node scripts/e2e-linux.mjs <${APPS.join("|")}> [playwright args]\n`)
  process.exit(2)
}

const root = resolve(import.meta.dirname, "..")
const { name: packageName } = JSON.parse(
  readFileSync(resolve(root, "apps", app, "package.json"), "utf8"),
)
if (typeof packageName !== "string") throw new TypeError(`apps/${app}/package.json has no name`)
const owner = `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`

// Runs inside the container. `$@` carries the extra Playwright arguments, never interpolated.
const script = `
set -euo pipefail
npm install --global --silent bun@${BUN_VERSION}
mkdir -p /work
tar -C /src --exclude=./.git --exclude=./tmp --exclude=node_modules --exclude=.next --exclude=dist --exclude=.turbo \\
  --exclude=test-results --exclude=playwright-report --exclude=playwright -cf - . | tar -C /work -xf -
cd /work
bun install --frozen-lockfile
bunx turbo run build --filter='${packageName}^...'
cd apps/${app}
# A missing baseline is written but fails its test by design, so this run's status is not the
# verdict; the second run is.
bunx playwright test --grep @visual --update-snapshots=changed "$@" || true
find e2e -type d -path '*-snapshots/linux' | tar -cf - -T - | tar -C /src/apps/${app} -xf -
# Hand the copied baselines to the host user instead of the container's root.
(cd /src/apps/${app} && find e2e -type d -path '*-snapshots/linux' -exec chown -R ${owner} {} +)
bunx playwright test --grep @visual "$@"
`

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--init",
    "--ipc=host",
    `--platform=${process.env.E2E_LINUX_PLATFORM ?? "linux/amd64"}`,
    "--volume",
    `${root}:/src`,
    "--env",
    "CI=",
    IMAGE,
    "bash",
    "-c",
    script,
    "e2e-linux",
    ...playwrightArgs,
  ],
  { stdio: "inherit" },
)
process.exit(result.status ?? 1)
