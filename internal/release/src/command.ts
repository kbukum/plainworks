import { ReleaseToolError } from "./error"
import { assertPublishOrder, orderForPublish } from "./publish-set"
import { findReleaseLineProblems, readPreState } from "./release-line"
import { readPublishableWorkspaces, type WorkspaceFiles } from "./workspace"

/** Where a command writes: `stdout` carries machine-readable output, `stderr` carries messages. */
export interface CommandOutput {
  stdout(text: string): void
  stderr(text: string): void
}

const USAGE = `Usage:
  plainworks-release publish-set           print the publish order, one workspace dir per line
  plainworks-release publish-set --json    print [{ dir, name, version }, …] in publish order
  plainworks-release publish-set --check   assert the publish order covers every workspace
  plainworks-release check-line            assert versions match the Changesets pre-release line
`

/**
 * Runs one release command and returns its exit code: `0` on success, `1` when a check fails, `2`
 * on a usage error. A {@link ReleaseToolError} becomes a message and exit code `1`; any other error
 * is a bug and is rethrown.
 */
export function runReleaseCommand(
  args: readonly string[],
  files: WorkspaceFiles,
  output: CommandOutput,
): number {
  try {
    const [command, flag, ...rest] = args
    if (rest.length > 0) return usage(output)
    if (command === "check-line" && flag === undefined) return checkLine(files, output)
    if (command === "publish-set") return publishSet(files, output, flag)
    return usage(output)
  } catch (error) {
    if (!(error instanceof ReleaseToolError)) throw error
    output.stderr(`${error.message}\n`)
    return 1
  }
}

function checkLine(files: WorkspaceFiles, output: CommandOutput): number {
  const pre = readPreState(files)
  const problems = findReleaseLineProblems(pre, readPublishableWorkspaces(files))
  if (problems.length > 0) {
    output.stderr(`Release line check failed:\n${problems.map((p) => `  - ${p}\n`).join("")}`)
    return 1
  }
  const line = pre === undefined ? "stable" : `${pre.tag} (${pre.mode})`
  output.stderr(`Release line OK — ${line}\n`)
  return 0
}

function publishSet(
  files: WorkspaceFiles,
  output: CommandOutput,
  flag: string | undefined,
): number {
  const workspaces = readPublishableWorkspaces(files)
  const ordered = orderForPublish(workspaces)
  if (flag === undefined) {
    output.stdout(`${ordered.map((w) => w.dir).join("\n")}\n`)
  } else if (flag === "--json") {
    const entries = ordered.map(({ dir, name, version }) => ({ dir, name, version }))
    output.stdout(`${JSON.stringify(entries)}\n`)
  } else if (flag === "--check") {
    assertPublishOrder(workspaces, ordered)
    const names = ordered.map((w) => w.name).join(", ")
    output.stderr(`Publish set OK — ${ordered.length} packages: ${names}\n`)
  } else {
    return usage(output)
  }
  return 0
}

function usage(output: CommandOutput): number {
  output.stderr(USAGE)
  return 2
}
