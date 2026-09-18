import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { DEFAULT_HOST, HOSTS, type HostId } from "../host"

export { DEFAULT_HOST, HOSTS, type HostId }

/** The fully resolved scaffold request, ready to execute. */
export interface ScaffoldOptions {
  readonly projectName: string
  readonly targetDir: string
  readonly host: HostId
  readonly install: boolean
  readonly git: boolean
}

/** The raw, validated argv, before prompting fills any gap. */
export interface ParsedArgs {
  readonly positionals: readonly string[]
  readonly host: string | undefined
  readonly install: boolean
  readonly git: boolean
  readonly yes: boolean
  readonly help: boolean
}

/** A prompt seam: ask for a value, offering `fallback` as the default. Injected so tests stay pure. */
export type PromptFn = (question: string, fallback: string) => Promise<string>

/** Raised when an input is invalid — a bad project name or an unknown host. */
export class InvalidOptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidOptionError"
  }
}

/** Remove every occurrence of a boolean flag from `args`, reporting whether it was present. */
function consumeFlag(args: string[], flag: string): boolean {
  let present = false
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (args[index] === flag) {
      args.splice(index, 1)
      present = true
    }
  }
  return present
}

/** Parse argv into validated tokens. `--no-install`/`--no-git` are consumed before strict parsing. */
export function parseScaffoldArgs(argv: readonly string[]): ParsedArgs {
  const args = [...argv]
  const install = !consumeFlag(args, "--no-install")
  const git = !consumeFlag(args, "--no-git")
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      host: { type: "string" },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  })
  return {
    positionals,
    host: values.host,
    install,
    git,
    yes: values.yes === true,
    help: values.help === true,
  }
}

const VALID_NAME = /^[a-z0-9][a-z0-9._-]*$/

/** Validate a project name, returning it trimmed. Throws {@link InvalidOptionError} when unusable. */
export function validateProjectName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new InvalidOptionError("Project name must not be empty.")
  }
  if (!VALID_NAME.test(trimmed)) {
    throw new InvalidOptionError(
      `Invalid project name "${trimmed}": use lowercase letters, digits, "-", "_" or "." and start with a letter or digit.`,
    )
  }
  return trimmed
}

/** Validate a host id against {@link HOSTS}. Throws {@link InvalidOptionError} for an unknown host. */
export function validateHost(host: string): HostId {
  if ((HOSTS as readonly string[]).includes(host)) {
    return host as HostId
  }
  throw new InvalidOptionError(`Unknown host "${host}". Available: ${HOSTS.join(", ")}.`)
}

const DEFAULT_PROJECT_NAME = "plainworks-app"

/**
 * Resolve {@link ParsedArgs} into a complete {@link ScaffoldOptions}. A missing project name is
 * taken from the first positional, else prompted for (or the default under `--yes`). The host is
 * validated when given, else defaults. `targetDir` is resolved against `cwd`.
 */
export async function resolveOptions(
  parsed: ParsedArgs,
  context: { readonly cwd: string; readonly prompt: PromptFn },
): Promise<ScaffoldOptions> {
  const fromArg = parsed.positionals[0]
  const rawName =
    fromArg ??
    (parsed.yes ? DEFAULT_PROJECT_NAME : await context.prompt("Project name", DEFAULT_PROJECT_NAME))
  const projectName = validateProjectName(rawName)
  const host = parsed.host === undefined ? DEFAULT_HOST : validateHost(parsed.host)
  const targetDir = resolve(context.cwd, projectName)
  return { projectName, targetDir, host, install: parsed.install, git: parsed.git }
}
