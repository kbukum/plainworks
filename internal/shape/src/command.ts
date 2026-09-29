import { WorkspaceError, type WorkspaceFiles } from "@plainworks/workspace"
import { ShapeError } from "./error"
import type { ConfigLoader } from "./inspect"
import { checkShape, syncShape } from "./shape"

/** What the shape commands read: the repository files and each workspace's config modules. */
export interface ShapeEnvironment {
  readonly files: WorkspaceFiles
  readonly configs: ConfigLoader
}

/** Where a command writes: `stdout` carries results, `stderr` carries problems. */
export interface CommandOutput {
  stdout(text: string): void
  stderr(text: string): void
}

const USAGE = `Usage:
  plainworks-shape check          report every workspace that drifts from its profile
  plainworks-shape sync [dir...]  write the fields each profile derives (all workspaces by default)
`

/**
 * Runs one shape command and returns its exit code: `0` on success, `1` when the check fails or the
 * repository cannot be read, `2` on a usage error. Any other error is a bug and is rethrown.
 */
export async function runShapeCommand(
  args: readonly string[],
  env: ShapeEnvironment,
  output: CommandOutput,
): Promise<number> {
  const [command, ...rest] = args
  try {
    if (command === "check" && rest.length === 0) return await check(env, output)
    if (command === "sync") return await sync(env, rest, output)
    output.stderr(USAGE)
    return 2
  } catch (error) {
    if (!(error instanceof ShapeError || error instanceof WorkspaceError)) throw error
    output.stderr(`${error.message}\n`)
    return 1
  }
}

async function check(env: ShapeEnvironment, output: CommandOutput): Promise<number> {
  const issues = await checkShape(env.files, env.configs)
  if (issues.length === 0) {
    output.stdout("Every workspace matches its profile.\n")
    return 0
  }
  for (const issue of issues) output.stderr(`${issue.dir}: ${issue.message}\n`)
  output.stderr(`${issues.length} shape issue${issues.length === 1 ? "" : "s"}.\n`)
  return 1
}

async function sync(
  env: ShapeEnvironment,
  dirs: readonly string[],
  output: CommandOutput,
): Promise<number> {
  const changed = await syncShape(env.files, env.configs, dirs.length > 0 ? dirs : undefined)
  output.stdout(
    changed.length === 0 ? "Nothing to sync.\n" : changed.map((dir) => `Synced ${dir}\n`).join(""),
  )
  return 0
}
