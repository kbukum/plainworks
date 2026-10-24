import { GATES, type Gate } from "./gates"

/** Where a command's output goes: the terminal, or a log file shared by stdout and stderr. */
export type OutputTarget =
  | { readonly kind: "inherit" }
  | { readonly kind: "log"; readonly path: string }

/** The effects the runner needs, injected so tests stay deterministic. */
export interface VerifyIo {
  /** Runs one command to completion and returns its exit code. */
  run(command: readonly string[], output: OutputTarget): number
  /** Returns a log file's full text. */
  read(path: string): string
  /** Prepares an empty log directory for this run and returns the path of a gate's log in it. */
  logPath(gate: string): string
  /** A monotonic clock in milliseconds. */
  now(): number
  write(text: string): void
}

/** What the arguments ask for. */
export type VerifyRequest =
  | { readonly kind: "run"; readonly filters: readonly string[]; readonly verbose: boolean }
  | { readonly kind: "list" }
  | { readonly kind: "usage" }

/** How many lines of a failing gate's log are printed. */
export const FAILURE_TAIL_LINES = 200

/**
 * The last `lines` lines of `text`, each ending in a newline, and how many earlier lines were left
 * out. Blank lines inside the text are kept; only the final newline's empty remainder is not a
 * line.
 */
export function tailLines(
  text: string,
  lines: number,
): { readonly text: string; readonly dropped: number } {
  const all = text.split("\n")
  if (all.at(-1) === "") all.pop()
  const kept = all.slice(-lines)
  return {
    text: kept.length === 0 ? "" : `${kept.join("\n")}\n`,
    dropped: all.length - kept.length,
  }
}

const USAGE = `Usage:
  bun run verify                          run every gate over the whole repo
  bun run verify --filter=<turbo filter>  scope the package gates (repeatable)
  bun run verify --verbose                stream every gate's output instead of one line per gate
  bun run verify --list                   list the gates in order
`

/** Parses `--list`, `--verbose`, or any number of `--filter=<x>` / `--filter <x>` arguments. */
export function parseVerifyArgs(args: readonly string[]): VerifyRequest {
  if (args.length === 1 && args[0] === "--list") return { kind: "list" }
  const filters: string[] = []
  let verbose = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === "--verbose" || arg === "-v") {
      verbose = true
      continue
    }
    const value = arg === "--filter" ? args[++index] : arg?.match(/^--filter=(.*)$/)?.[1]
    if (value === undefined || value.length === 0) return { kind: "usage" }
    filters.push(value)
  }
  return { kind: "run", filters, verbose }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Runs the gates in order and stops at the first failure. Returns `0` when every gate passes, `1`
 * when one fails, and `2` on a usage error.
 *
 * By default a passing gate prints one line and its output goes only to its log file; a failing
 * gate prints the last {@link FAILURE_TAIL_LINES} lines and the log path. `--verbose` streams.
 */
export function runVerify(
  args: readonly string[],
  io: VerifyIo,
  gates: readonly Gate[] = GATES,
): number {
  const request = parseVerifyArgs(args)
  if (request.kind === "usage") {
    io.write(USAGE)
    return 2
  }
  if (request.kind === "list") {
    const width = String(gates.length).length
    for (const [index, gate] of gates.entries()) {
      io.write(`${String(index + 1).padStart(width)}. ${gate.name} — ${gate.summary}\n`)
    }
    return 0
  }
  const started = io.now()
  for (const gate of gates) {
    const gateStarted = io.now()
    const output: OutputTarget = request.verbose
      ? { kind: "inherit" }
      : { kind: "log", path: io.logPath(gate.name) }
    io.write(request.verbose ? `\n▶ ${gate.name}\n` : `▶ ${gate.name} … `)
    for (const command of gate.commands(request.filters)) {
      if (io.run(command, output) !== 0) {
        const elapsed = seconds(io.now() - gateStarted)
        if (output.kind === "log") {
          const { text, dropped } = tailLines(io.read(output.path), FAILURE_TAIL_LINES)
          io.write(`failed (${elapsed})\n`)
          if (dropped > 0) io.write(`… ${dropped} earlier lines are in the log\n`)
          io.write(text)
          io.write(`log: ${output.path}\n`)
        }
        io.write(`\nverify: ${gate.name} failed (${command.join(" ")})\n`)
        return 1
      }
    }
    if (!request.verbose) io.write(`ok (${seconds(io.now() - gateStarted)})\n`)
  }
  io.write(`\nverify: all ${gates.length} gates passed (${seconds(io.now() - started)})\n`)
  return 0
}
