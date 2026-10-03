import type { FailureCode, RemoteFailure } from "@plainworks/std/failure"

export interface FailureOutcome {
  readonly kind: "unauthenticated" | "failure"
  readonly failure: RemoteFailure
  readonly message: string
}

export interface FailureHandlerOptions {
  readonly messages?: Partial<Readonly<Record<FailureCode, string>>>
  readonly reasons?: Readonly<Record<string, string>>
  readonly handlers?: Partial<Readonly<Record<FailureCode, (outcome: FailureOutcome) => void>>>
  readonly onFailure: (outcome: FailureOutcome) => void
  readonly onUnauthenticated?: (outcome: FailureOutcome) => void
}

/** One injected app boundary; terminal auth never enters a generic retry/refresh path. */
export function createFailureHandler(
  options: FailureHandlerOptions,
): (failure: RemoteFailure) => FailureOutcome {
  return (failure) => {
    const outcome: FailureOutcome = {
      kind: failure.authentication === "unauthenticated" ? "unauthenticated" : "failure",
      failure,
      message:
        (failure.reason === undefined ? undefined : options.reasons?.[failure.reason]) ??
        options.messages?.[failure.code] ??
        failure.message,
    }
    if (outcome.kind === "unauthenticated") {
      ;(options.onUnauthenticated ?? options.onFailure)(outcome)
    } else {
      ;(options.handlers?.[failure.code] ?? options.onFailure)(outcome)
    }
    return outcome
  }
}
