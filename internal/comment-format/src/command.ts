import { type AuditResult, auditSources, type ReflowSource } from "./audit"
import { CommentFormatError } from "./error"
import { reflowSource } from "./reflow"
import { codeUnchanged } from "./safety"

/** File operations used by the comment-format command. */
export interface CommentFormatEnvironment {
  collectFiles(root: string): readonly string[]
  readText(path: string): string
  writeText(path: string, text: string): void
  reflowSource?: ReflowSource
}

/** Where a command writes: `stdout` carries success output, `stderr` carries messages. */
export interface CommandOutput {
  stdout(text: string): void
  stderr(text: string): void
}

const USAGE = "Usage: plainworks-comment-format <check|write|audit> <root...>\n"
const FIX_HINT = "Run `bun run format-comments`"

/**
 * Runs one comment-format command and returns `0` on success, `1` for check/audit failures, `2` for
 * usage errors, and `3` when write mode would alter code.
 */
export function runCommentFormat(
  args: readonly string[],
  env: CommentFormatEnvironment,
  output: CommandOutput,
): number {
  const [command, ...roots] = args
  try {
    if ((command === "check" || command === "write" || command === "audit") && roots.length > 0) {
      if (command === "audit") return audit(roots, env, output)
      return format(command, roots, env, output)
    }
    output.stderr(USAGE)
    return 2
  } catch (error) {
    if (!(error instanceof CommentFormatError)) throw error
    output.stderr(`${error.message}\n`)
    return 1
  }
}

function format(
  mode: "check" | "write",
  roots: readonly string[],
  env: CommentFormatEnvironment,
  output: CommandOutput,
): number {
  const reflow = env.reflowSource ?? reflowSource
  const edits = roots
    .flatMap((root) => [...env.collectFiles(root)])
    .map((path) => {
      const text = env.readText(path)
      return { path, text, reflowed: reflow(path, text) }
    })
    .filter(({ text, reflowed }) => reflowed !== text)

  const unsafe = edits.find(({ path, text, reflowed }) => !codeUnchanged(path, text, reflowed))
  if (unsafe !== undefined) {
    output.stderr(
      `comment-format: ABORTED — reflow would alter code in ${unsafe.path}. This is a bug in the reflow transform; no files were written.\n`,
    )
    return 3
  }

  if (mode === "write") {
    for (const { path, reflowed } of edits) env.writeText(path, reflowed)
    output.stdout(`comment-format: reflowed ${edits.length} file(s)\n`)
    return 0
  }

  if (edits.length > 0) {
    output.stderr(
      `comment-format: ${edits.length} file(s) have over-width comments. ${FIX_HINT}:\n` +
        edits.map(({ path }) => `  ${path}\n`).join(""),
    )
    return 1
  }
  output.stdout("comment-format: all comments within width\n")
  return 0
}

function audit(
  roots: readonly string[],
  env: CommentFormatEnvironment,
  output: CommandOutput,
): number {
  const sources = roots
    .flatMap((root) => [...env.collectFiles(root)])
    .map((path) => ({ path, text: env.readText(path) }))
  const result = auditSources(sources, env.reflowSource ?? reflowSource)
  outputAuditSummary(result, output)
  return result.failures.length > 0 ? 1 : 0
}

function outputAuditSummary(result: AuditResult, output: CommandOutput): void {
  output.stdout(
    `comment-format verify: ${result.checked} files checked, ${result.changed} would change\n`,
  )
  if (result.failures.length > 0) {
    output.stderr(
      `\nSAFETY VIOLATIONS (${result.failures.length}):\n${result.failures.map((failure) => `  ${failure}\n`).join("")}`,
    )
    return
  }
  output.stdout("all four safety invariants hold on every changed file\n")
}
