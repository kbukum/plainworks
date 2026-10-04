import { AbortError, raceAbort } from "@plainworks/std/resilience"
import type { WebAbortSignal } from "@plainworks/std/web"
import type { GateHostRuntime } from "./config"
import { stopSpawnedHost } from "./lifecycle"
import { nodeGateHostRuntime } from "./node-runtime"

/** What an owned command left behind: its exit code (1 when a signal ended it) and output tail. */
export interface OwnedCommandResult {
  readonly code: number
  readonly output: string
}

/**
 * Run one command in its own process group and always release that group afterwards, whether the
 * command exited, failed, or `signal` cancelled it. A cancellation rejects with an `AbortError`
 * whose cause is the signal's reason; a group that had to be forced down rejects with
 * `HostShutdownError`, and both are kept when both happen.
 */
export async function runOwnedCommand(
  command: string,
  args: readonly string[],
  options: {
    readonly signal: WebAbortSignal
    readonly cwd?: string
    readonly env?: Readonly<Record<string, string>>
    /** Also append the full output to this file. */
    readonly log?: string
  },
  runtime: GateHostRuntime = nodeGateHostRuntime,
): Promise<OwnedCommandResult> {
  if (options.signal.aborted) throw new AbortError({ cause: options.signal.reason })
  const child = runtime.spawn(command, args, {
    cwd: options.cwd,
    env: options.env ?? {},
    ...(options.log === undefined ? {} : { log: options.log }),
  })
  let outcome: { readonly code: number } | { readonly cause: unknown }
  try {
    outcome = { code: (await raceAbort(child.exited, options.signal)) ?? 1 }
  } catch (cause) {
    outcome = { cause }
  }
  try {
    await stopSpawnedHost(child, runtime)
  } catch (cleanup) {
    if ("code" in outcome) throw cleanup
    throw new AggregateError([outcome.cause, cleanup], `${command} was cancelled; cleanup failed.`)
  }
  if ("cause" in outcome) throw outcome.cause
  return { code: outcome.code, output: child.output() }
}
