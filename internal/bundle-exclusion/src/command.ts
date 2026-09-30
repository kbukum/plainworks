import { parseHostConfig } from "./config"
import { BundleExclusionError } from "./error"
import { type ResolveEnvironment, resolveRule } from "./resolve"
import { mergeRules, RULES } from "./rules"
import { type Artifact, describeLeak, scanArtifacts } from "./scan"

/** File-system and path operations used by the bundle-exclusion command. */
export interface BundleExclusionEnvironment extends ResolveEnvironment {
  cwd(): string
  resolve(path: string): string
  relative(from: string, to: string): string
  listArtifactFiles(directory: string): readonly string[]
}

/** Where a command writes: `stdout` carries success output, `stderr` carries messages. */
export interface CommandOutput {
  stdout(text: string): void
  stderr(text: string): void
}

const USAGE = "Usage: plainworks-bundle-exclusion <config.json>\n"

/**
 * Runs the bundle-exclusion check and returns `0` on success, `1` for expected check failures, and
 * `2` for usage errors. Unexpected errors are rethrown.
 */
export function runBundleExclusion(
  args: readonly string[],
  env: BundleExclusionEnvironment,
  output: CommandOutput,
): number {
  try {
    const [configArg, ...extra] = args
    if (configArg === undefined || extra.length > 0) {
      output.stderr(USAGE)
      return 2
    }
    const configFile = env.resolve(configArg)
    const config = parseHostConfig(configFile, env.readText(configFile))
    const base = env.dirname(configFile)
    const rule = resolveRule(mergeRules(RULES[config.rule] ?? {}, config), base, env)
    const artifacts = config.directories.flatMap((directory) =>
      readArtifacts(env.join(base, directory), env),
    )
    const { leaks, unmapped } = scanArtifacts(artifacts, rule)
    const label = env.relative(env.cwd(), configFile)
    if (leaks.length > 0) {
      for (const leak of leaks.slice(0, 20)) output.stderr(`${describeLeak(leak)}\n`)
      if (leaks.length > 20) output.stderr(`…and ${leaks.length - 20} more\n`)
      throw new BundleExclusionError(`${label}: the production build is not clean`)
    }
    output.stdout(
      `${label}: production build excludes ${config.rule} ` +
        `(${artifacts.length} files; ${unmapped.length} allowed unmapped scripts marker-checked)\n`,
    )
    return 0
  } catch (error) {
    if (!(error instanceof BundleExclusionError)) throw error
    output.stderr(`${error.message}\n`)
    return 1
  }
}

function readArtifacts(directory: string, env: BundleExclusionEnvironment): Artifact[] {
  let paths: readonly string[]
  try {
    paths = env.listArtifactFiles(directory)
  } catch (error) {
    throw new BundleExclusionError(
      `Cannot read ${directory} (${String(error)}); run the host's production build first`,
      { cause: error },
    )
  }
  if (!paths.some((path) => path.endsWith(".map"))) {
    throw new BundleExclusionError(
      `${directory} has no source maps; enable them for the production build`,
    )
  }
  return paths.map((path) => ({ path, text: env.readText(path) }))
}
