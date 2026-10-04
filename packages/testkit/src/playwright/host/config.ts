import type { Clock } from "@plainworks/std/time"
import type { WebAbortSignal } from "@plainworks/std/web"

/** One owned process and origin per Playwright worker. */
export interface BrowserGateHost {
  readonly command:
    | readonly [string, ...string[]]
    | ((target: {
        readonly port: number
        readonly origin: string
      }) => readonly [string, ...string[]])
  readonly env?: (target: {
    readonly port: number
    readonly origin: string
  }) => Readonly<Record<string, string>>
  readonly cwd?: string
  readonly basePort: number
  /** HTTP loopback by default; HTTPS requires explicitly installed test trust. */
  readonly origin?: (port: number) => string
  readonly readyPath: string
  /** Exact expected status; defaults to 200. Redirects never prove readiness. */
  readonly readyStatus?: number
  /** Validate the response, including the expected run/build identity where available. */
  readonly ready?: (response: Response) => boolean | Promise<boolean>
  readonly warmPaths?: readonly string[]
  /** Whole startup budget, including warming. Defaults to 30 seconds. */
  readonly startTimeoutMs?: number
  /** Probe budget, including response validation. Defaults to 1 second. */
  readonly probeTimeoutMs?: number
  /** Graceful stop budget. Defaults to 10 seconds; forced termination is a failure. */
  readonly stopTimeoutMs?: number
}

/**
 * The runtime's child lease. `exited` settles when the direct child exits; output and the log are
 * complete once `waitForRelease` resolves, since a descendant may still hold the output pipes.
 */
export interface SpawnedHost {
  readonly exited: Promise<number | null>
  /** Observe group release only for this bounded stop attempt; cancellation ends observation. */
  waitForRelease(signal: AbortSignal): Promise<void>
  output(): string
  kill(signal: "SIGTERM" | "SIGKILL"): void
}

/** Injected process, network, and timing seams for lifecycle tests. */
export interface GateHostRuntime {
  readonly available: (hostname: string, port: number) => Promise<boolean>
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string | undefined
      readonly env: Readonly<Record<string, string>>
      /** Also append the full output to this file; it is flushed before `waitForRelease` resolves. */
      readonly log?: string
    },
  ) => SpawnedHost
  readonly fetch: (
    url: string,
    init: Omit<RequestInit, "signal"> & { readonly signal?: WebAbortSignal },
  ) => Promise<Response>
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  readonly clock: Clock
}

/** An explicitly owned host. Restart preserves its configured origin and state paths. */
export interface RunningGateHost {
  readonly origin: string
  stop(): Promise<void>
  restart(): Promise<void>
}
