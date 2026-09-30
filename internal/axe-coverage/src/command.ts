import { findAxeCoverageViolations, type RenderTestSource } from "./coverage"

/** Where a command writes its report. */
export interface CommandOutput {
  stdout(text: string): void
  stderr(text: string): void
}

/** Reads the render tests under one root; the CLI binds it to the file system. */
export type RenderTestReader = (root: string) => readonly RenderTestSource[]

const USAGE = "Usage: plainworks-axe-coverage <root>...\n"

/**
 * Check every render test under the given roots and return the exit code: `0` when each one runs
 * the shared axe assertion, `1` when any does not, `2` on a usage error.
 */
export function runCommand(
  args: readonly string[],
  readRenderTests: RenderTestReader,
  output: CommandOutput,
): number {
  if (args.length === 0) {
    output.stderr(USAGE)
    return 2
  }
  const files = args.flatMap((root) => readRenderTests(root))
  const violations = findAxeCoverageViolations(files)
  if (violations.length > 0) {
    output.stderr(`${violations.join("\n")}\n`)
    return 1
  }
  output.stdout(`plainworks-axe-coverage: ${files.length} render test files run axe\n`)
  return 0
}
