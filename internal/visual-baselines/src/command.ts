import { BUN_VERSION, DEFAULT_PLATFORM, PLAYWRIGHT_IMAGE } from "./config"

/** A parsed invocation: the app to refresh and the extra arguments forwarded to Playwright. */
export interface BaselineRequest {
  readonly app: string
  readonly playwrightArgs: readonly string[]
}

/** Why an invocation could not be parsed, with the usage line to print. */
export interface BaselineUsageError {
  readonly usage: string
}

/** Parse `<app> [playwright args]`, accepting only an app that carries visual baselines. */
export function parseBaselineArgs(
  argv: readonly string[],
  apps: readonly string[],
): BaselineRequest | BaselineUsageError {
  const [app, ...playwrightArgs] = argv
  if (app === undefined || !apps.includes(app)) {
    return { usage: `Usage: plainworks-visual-baselines <${apps.join("|")}> [playwright args]` }
  }
  return { app, playwrightArgs }
}

/** What the in-container script needs to know about the app and the host user. */
export interface ContainerScriptInput {
  readonly app: string
  readonly packageName: string
  readonly owner: string
}

/**
 * The bash script run inside the container. It copies the working tree in (host `node_modules`,
 * `.git`, and `tmp/` never leak in), builds the app's workspace dependencies, writes changed or
 * missing `@visual` baselines, copies only the `linux` baseline folders back, and reruns to prove
 * they are stable. `$@` carries the extra Playwright arguments, never interpolated.
 */
export function containerScript({ app, packageName, owner }: ContainerScriptInput): string {
  return `
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
}

/** The inputs of one `docker run`. */
export interface DockerRunInput {
  readonly repoRoot: string
  readonly script: string
  readonly playwrightArgs: readonly string[]
  readonly platform: string | undefined
}

/** The `docker` argument vector that mounts the repo and runs `script` in the CI image. */
export function dockerRunArgs({
  repoRoot,
  script,
  playwrightArgs,
  platform,
}: DockerRunInput): string[] {
  return [
    "run",
    "--rm",
    "--init",
    "--ipc=host",
    `--platform=${platform ?? DEFAULT_PLATFORM}`,
    "--volume",
    `${repoRoot}:/src`,
    "--env",
    "CI=",
    PLAYWRIGHT_IMAGE,
    "bash",
    "-c",
    script,
    "e2e-linux",
    ...playwrightArgs,
  ]
}
