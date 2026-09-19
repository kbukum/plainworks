// The CLI execution seam: wires argument parsing, option resolution, project generation, and the
// install/git finalization tail behind a testable, injectable interface. Top-level side effects
// (process.argv, stdout/stderr, process.exit) remain in `bin.ts`, while the orchestration is fully
// unit-tested here with fake runners and prompt seams.

import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  type CommandRunner,
  detectPackageManager,
  initGit,
  installDependencies,
  type PackageManager,
} from "../scaffold/finalize"
import { generateProject } from "../scaffold/generate"
import { CATALOG_VERSIONS, PLAINWORKS_VERSIONS } from "../versions"
import { type PromptFn, parseScaffoldArgs, resolveOptions, type ScaffoldOptions } from "./options"
import { readlinePrompt } from "./prompt"

/** The default terminal command runner. Spawns synchronously with inherited stdio. */
export const defaultCommandRunner: CommandRunner = (command, args, cwd) => {
  execFileSync(command, [...args], { cwd, stdio: "inherit" })
}

/** Determine the default examples template directory, whether running compiled or from source. */
export function defaultTemplateBaseDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidateDist = join(here, "..", "examples")
  if (existsSync(candidateDist)) return candidateDist
  return join(here, "..", "..", "examples")
}

/** Help text displayed for `--help` or `-h`. */
export const HELP = `create-plainworks — scaffold a wired plainworks app

Usage:
  npm create plainworks <project-name> [options]
  bunx create-plainworks <project-name> [options]

Options:
  --host <name>   Host template to generate (default: next)
  --no-install    Skip installing dependencies
  --no-git        Skip initializing a git repository
  -y, --yes       Accept defaults without prompting (for CI)
  -h, --help      Show this help
`

/** Options for {@link executeScaffold}. */
export interface ExecuteScaffoldOptions {
  /** Working directory for path resolution. Defaults to `process.cwd()`. */
  readonly cwd?: string
  /** Injected prompt implementation. Defaults to {@link readlinePrompt}. */
  readonly prompt?: PromptFn
  /** Injected command runner for install/git. Defaults to {@link defaultCommandRunner}. */
  readonly runner?: CommandRunner
  /** Injected stdout writer. Defaults to writing to `process.stdout`. */
  readonly out?: (text: string) => void
  /** Injected stderr writer. Defaults to writing to `process.stderr`. */
  readonly err?: (text: string) => void
  /** Injected base directory for example templates. Defaults to `../examples`. */
  readonly templateBaseDir?: string
  /** Injected package manager for installation and next-steps guidance. Defaults to detection. */
  readonly packageManager?: PackageManager
}

/** The "what to do next" epilogue, tailored to the package manager and whether deps were installed. */
export function nextSteps(options: ScaffoldOptions, packageManager: PackageManager): string {
  const lines = [`\nCreated ${options.projectName} at ${options.targetDir}\n`, "\nNext steps:\n"]
  lines.push(`  cd ${options.projectName}\n`)
  if (!options.install) lines.push(`  ${packageManager} install\n`)
  lines.push(`  ${packageManager} run dev\n`)
  return lines.join("")
}

/**
 * Execute the create-plainworks workflow for the given argv.
 * Returns an exit code (0 for success, 1 for failure).
 */
export async function executeScaffold(
  argv: readonly string[],
  options: ExecuteScaffoldOptions = {},
): Promise<number> {
  const out = options.out ?? ((text) => process.stdout.write(text))
  const err = options.err ?? ((text) => process.stderr.write(text))
  const cwd = options.cwd ?? process.cwd()
  const prompt = options.prompt ?? readlinePrompt
  const runner = options.runner ?? defaultCommandRunner

  try {
    const parsed = parseScaffoldArgs(argv)
    if (parsed.help) {
      out(HELP)
      return 0
    }
    const resolved = await resolveOptions(parsed, { cwd, prompt })
    const packageManager = options.packageManager ?? detectPackageManager()
    const templateBase = options.templateBaseDir ?? defaultTemplateBaseDir()
    const exampleDir = join(templateBase, resolved.host)

    generateProject({
      projectName: resolved.projectName,
      targetDir: resolved.targetDir,
      templateDir: exampleDir,
      plainworksVersions: PLAINWORKS_VERSIONS,
      catalogVersions: CATALOG_VERSIONS,
    })
    if (resolved.install) installDependencies(resolved.targetDir, packageManager, runner)
    if (resolved.git) initGit(resolved.targetDir, runner)
    out(nextSteps(resolved, packageManager))
    return 0
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    err(`\ncreate-plainworks: ${message}\n`)
    return 1
  }
}
