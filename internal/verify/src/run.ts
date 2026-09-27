import { GATES, type Gate } from "./gates"

/** Runs one command to completion and returns its exit code. */
export type CommandRunner = (command: readonly string[]) => number

/** What the arguments ask for. */
export type VerifyRequest =
  | { readonly kind: "run"; readonly filters: readonly string[] }
  | { readonly kind: "list" }
  | { readonly kind: "usage" }

const USAGE = `Usage:
  bun run verify                          run every gate over the whole repo
  bun run verify --filter=<turbo filter>  scope the package gates (repeatable)
  bun run verify --list                   list the gates in order
`

/** Parses `--list`, or any number of `--filter=<x>` / `--filter <x>` arguments. */
export function parseVerifyArgs(args: readonly string[]): VerifyRequest {
  if (args.length === 1 && args[0] === "--list") return { kind: "list" }
  const filters: string[] = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    const value = arg === "--filter" ? args[++index] : arg?.match(/^--filter=(.*)$/)?.[1]
    if (value === undefined || value.length === 0) return { kind: "usage" }
    filters.push(value)
  }
  return { kind: "run", filters }
}

/**
 * Runs the gates in order and stops at the first failure. Returns `0` when every gate passes, `1`
 * when one fails, and `2` on a usage error.
 */
export function runVerify(
  args: readonly string[],
  run: CommandRunner,
  write: (text: string) => void,
  gates: readonly Gate[] = GATES,
): number {
  const request = parseVerifyArgs(args)
  if (request.kind === "usage") {
    write(USAGE)
    return 2
  }
  if (request.kind === "list") {
    const width = String(gates.length).length
    for (const [index, gate] of gates.entries()) {
      write(`${String(index + 1).padStart(width)}. ${gate.name} — ${gate.summary}\n`)
    }
    return 0
  }
  for (const gate of gates) {
    write(`\n▶ ${gate.name}\n`)
    for (const command of gate.commands(request.filters)) {
      if (run(command) !== 0) {
        write(`\nverify: ${gate.name} failed (${command.join(" ")})\n`)
        return 1
      }
    }
  }
  write(`\nverify: all ${gates.length} gates passed\n`)
  return 0
}
