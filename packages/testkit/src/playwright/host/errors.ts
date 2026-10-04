import { PlainError } from "@plainworks/std"
import type { RunningGateHost } from "./config"

/**
 * Startup failed and so did its cleanup. When `retained` is true the process group is still alive
 * and `host` is the only owner allowed to retry `stop()`; otherwise forced termination released it.
 */
export class HostStartupError extends PlainError<"testkit/host-startup"> {
  override readonly name: string = "HostStartupError"
  readonly host: RunningGateHost
  readonly retained: boolean

  constructor(host: RunningGateHost, retained: boolean, cause: unknown, cleanup: unknown) {
    super(
      "testkit/host-startup",
      retained
        ? "Host startup and cleanup failed; retry host.stop()."
        : "Host startup failed and required forced termination.",
      { cause: new AggregateError([cause, cleanup], "Host startup and cleanup failed.") },
    )
    this.host = host
    this.retained = retained
  }
}

/** Forced or incomplete process shutdown is never a successful graceful stop. */
export class HostShutdownError extends PlainError<"testkit/host-shutdown"> {
  override readonly name: string = "HostShutdownError"
  readonly released: boolean

  constructor(released: boolean) {
    super(
      "testkit/host-shutdown",
      released
        ? "Host required forced termination; graceful shutdown failed."
        : "Host forced termination did not settle; cleanup ownership is retained.",
    )
    this.released = released
  }
}
