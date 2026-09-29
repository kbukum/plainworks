import { WorkspaceError, type WorkspaceFiles } from "@plainworks/workspace"
import { ReleaseToolError } from "./error"
import { checkPackaging, type PackTools, packWorkspace } from "./pack"
import { assertPublishOrder, orderForPublish } from "./publish-set"
import { findReleaseLineProblems, readPreState } from "./release-line"
import { readPublishableWorkspaces } from "./workspace"

/** What the release commands read and run: the repository files and the packing tools. */
export interface ReleaseEnvironment {
  readonly files: WorkspaceFiles
  readonly pack: PackTools
}

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
  plainworks-release pack <dir> [--destination <dir>]
                                           pack a workspace as npm publishes it; print the tarball
  plainworks-release check-packaging [dir] run publint and are-the-types-wrong on that tarball
`

/**
 * Runs one release command and returns its exit code: `0` on success, `1` when a check fails, `2`
 * on a usage error. A {@link ReleaseToolError} or {@link WorkspaceError} becomes a message and exit
 * code `1`; any other error is a bug and is rethrown.
 */
export async function runReleaseCommand(
  args: readonly string[],
  env: ReleaseEnvironment,
  output: CommandOutput,
): Promise<number> {
  try {
    const [command, ...rest] = args
    if (command === "pack") return await pack(rest, env.pack, output)
    if (command === "check-packaging" && rest.length <= 1) {
      return await packaging(rest[0] ?? ".", env.pack, output)
    }
    const [flag, ...extra] = rest
    if (extra.length > 0) return usage(output)
    if (command === "check-line" && flag === undefined) return checkLine(env.files, output)
    if (command === "publish-set") return publishSet(env.files, output, flag)
    return usage(output)
  } catch (error) {
    if (!(error instanceof ReleaseToolError || error instanceof WorkspaceError)) throw error
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

async function pack(
  args: readonly string[],
  tools: PackTools,
  output: CommandOutput,
): Promise<number> {
  const [dir, flag, destination, ...extra] = args
  const valid = flag === undefined || (flag === "--destination" && destination !== undefined)
  if (dir === undefined || !valid || extra.length > 0) return usage(output)
  const { tarball } = await packWorkspace(dir, destination ?? (await tools.tempDir()), tools)
  output.stdout(`${tarball}\n`)
  return 0
}

async function packaging(dir: string, tools: PackTools, output: CommandOutput): Promise<number> {
  const result = await checkPackaging(dir, tools)
  output.stdout(result.output)
  return result.code
}

function usage(output: CommandOutput): number {
  output.stderr(USAGE)
  return 2
}
