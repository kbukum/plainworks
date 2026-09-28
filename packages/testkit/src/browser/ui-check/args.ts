import { parseArgs } from "node:util"
import { MATRIX_PRESETS, type MatrixPresetName } from "../flow/matrix/presets"
import { UiCheckError } from "./errors"

/** Which flows a check runs. */
export type UiCheckSelect =
  | { readonly by: "all" }
  | { readonly by: "named"; readonly flows: readonly string[] }
  | { readonly by: "affected" }

/** A parsed `ui:check` command line. */
export type UiCheckArgs =
  | {
      readonly command: "check"
      readonly select: UiCheckSelect
      readonly preset: MatrixPresetName
      /** Save this run as a named snapshot, a base for a later run. */
      readonly saveAs?: string
      /** Compare with this snapshot name, or else this git ref. */
      readonly base?: string
      /** `false` skips the change review. */
      readonly diff: boolean
    }
  | { readonly command: "serve" }
  | { readonly command: "help" }

/** The usage text `ui:check --help` prints. */
export const UI_CHECK_USAGE: string = `Usage: ui:check [--affected | --flow <a,b>] [--preset <name>] [--save-as <name>] [--base <snapshot|ref>] [--no-diff]
       ui:check serve

  --affected         Run the flows that cover a file changed since the merge-base.
  --flow <a,b>       Run the named flows.
  --preset <name>    The matrix: ${Object.keys(MATRIX_PRESETS).join(", ")}. Defaults to quick.
  --save-as <name>   Save this run as a snapshot, such as "before", to compare with later.
  --base <name|ref>  Compare with a saved snapshot, or with a capture of a git ref's merge-base.
                     Without it, a run compares with the "before" snapshot when one exists.
  --no-diff          Skip the change review.
  serve              Keep a signed-in host running for fast checks and Playwright MCP.

Exit codes: 0 no hard failure, 1 a hard failure, 2 a harness or usage error.`

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Parse a `ui:check` command line. Throws a `usage` {@link UiCheckError} for an unknown flag, a
 * conflicting pair, or a bad value, so the command exits with the harness code.
 */
export function parseUiCheckArgs(argv: readonly string[]): UiCheckArgs {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new UiCheckError("usage", `${reason}\n\n${UI_CHECK_USAGE}`, { cause })
  }
  const { values, positionals } = parsed
  if (values.help === true) return { command: "help" }
  const [command, ...rest] = positionals
  if (command === "serve") {
    if (rest.length > 0 || Object.keys(values).length > 0) usage("serve takes no flags")
    return { command: "serve" }
  }
  if (command !== undefined) usage(`Unexpected argument "${command}"`)

  if (values.affected === true && values.flow !== undefined) {
    usage("Pass either --affected or --flow, not both")
  }
  const preset = values.preset ?? "quick"
  if (!isPreset(preset)) {
    usage(`Unknown preset "${preset}"; use one of ${Object.keys(MATRIX_PRESETS).join(", ")}`)
  }
  if (values["save-as"] !== undefined && !SLUG.test(values["save-as"])) {
    usage(`--save-as needs a lowercase slug, such as "before"`)
  }
  if (values.base !== undefined && values["no-diff"] === true) {
    usage("--base compares, --no-diff skips the comparison: pass one")
  }
  return {
    command: "check",
    select: selectOf(values.affected === true, values.flow),
    preset,
    ...(values["save-as"] === undefined ? {} : { saveAs: values["save-as"] }),
    ...(values.base === undefined ? {} : { base: values.base }),
    diff: values["no-diff"] !== true,
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      affected: { type: "boolean" },
      flow: { type: "string" },
      preset: { type: "string" },
      "save-as": { type: "string" },
      base: { type: "string" },
      "no-diff": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  })

function selectOf(affected: boolean, flow: string | undefined): UiCheckSelect {
  if (affected) return { by: "affected" }
  if (flow === undefined) return { by: "all" }
  const flows = flow
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "")
  if (flows.length === 0) usage("--flow needs at least one flow name")
  return { by: "named", flows }
}

const isPreset = (value: string): value is MatrixPresetName => Object.hasOwn(MATRIX_PRESETS, value)

function usage(message: string): never {
  throw new UiCheckError("usage", `${message}\n\n${UI_CHECK_USAGE}`)
}
