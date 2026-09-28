import { parseArgs } from "node:util"
import { MATRIX_PRESETS, type MatrixPresetName } from "../flow/matrix/presets"
import { UiCaptureError } from "./errors"

/** Which flows a capture runs. `docs` runs the flows that mark docs images, and publishes them. */
export type UiCaptureSelect =
  | { readonly by: "all" }
  | { readonly by: "named"; readonly flows: readonly string[] }
  | { readonly by: "affected" }
  | { readonly by: "docs" }

/** A parsed `ui:capture` command line. */
export type UiCaptureArgs =
  | {
      readonly command: "capture"
      readonly select: UiCaptureSelect
      readonly preset: MatrixPresetName
      /** Save this run as a named snapshot, a base for a later run. */
      readonly saveAs?: string
      /** Compare with this snapshot name, or else this git ref. Without it, nothing is compared. */
      readonly base?: string
    }
  | { readonly command: "serve" }
  | { readonly command: "help" }

/** The usage text `ui:capture --help` prints. */
export const UI_CAPTURE_USAGE: string = `Usage: ui:capture [--flow <a,b> | --affected] [--preset <name>] [--save-as <name>] [--base <snapshot|ref>]
       ui:capture --docs
       ui:capture serve

Captures a frame and an ARIA snapshot at every flow checkpoint, for you to look at. It runs no
checks; the e2e suite does that.

  --flow <a,b>       Capture the named flows. Without it or --affected, every flow.
  --affected         Capture the flows that cover a file changed since the merge-base.
  --preset <name>    The matrix: ${Object.keys(MATRIX_PRESETS).join(", ")}. Defaults to quick.
  --save-as <name>   Save this run as a snapshot, such as "before", to compare with later.
  --base <name|ref>  Also compare with a saved snapshot, or with a capture of a git ref's
                     merge-base, and show what changed.
  --docs             Refresh the app's docs images: capture the flows that mark them and copy
                     each marked desktop frame, light and dark, into the docs folder, removing
                     images no checkpoint names. Takes no other flag. A broken flow writes nothing.
  serve              Keep a signed-in host running for fast captures and Playwright MCP.

Exit codes: 0 captured, 1 a flow broke (an error, a runtime error, no hydration), 2 a harness or usage error.`

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Parse a `ui:capture` command line. Throws a `usage` {@link UiCaptureError} for an unknown flag, a
 * conflicting pair, or a bad value, so the command exits with the harness code.
 */
export function parseUiCaptureArgs(argv: readonly string[]): UiCaptureArgs {
  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(argv)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    throw new UiCaptureError("usage", `${reason}\n\n${UI_CAPTURE_USAGE}`, { cause })
  }
  const { values, positionals } = parsed
  if (values.help === true) return { command: "help" }
  const [command, ...rest] = positionals
  if (command === "serve") {
    if (rest.length > 0 || Object.keys(values).length > 0) usage("serve takes no flags")
    return { command: "serve" }
  }
  if (command !== undefined) usage(`Unexpected argument "${command}"`)
  if (values.docs === true) {
    if (Object.keys(values).length > 1) usage("--docs takes no other flag")
    return { command: "capture", select: { by: "docs" }, preset: "quick" }
  }

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
  return {
    command: "capture",
    select: selectOf(values.affected === true, values.flow),
    preset,
    ...(values["save-as"] === undefined ? {} : { saveAs: values["save-as"] }),
    ...(values.base === undefined ? {} : { base: values.base }),
  }
}

const parse = (argv: readonly string[]) =>
  parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      affected: { type: "boolean" },
      docs: { type: "boolean" },
      flow: { type: "string" },
      preset: { type: "string" },
      "save-as": { type: "string" },
      base: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  })

function selectOf(affected: boolean, flow: string | undefined): UiCaptureSelect {
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
  throw new UiCaptureError("usage", `${message}\n\n${UI_CAPTURE_USAGE}`)
}
