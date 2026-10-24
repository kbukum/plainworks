import {
  decodeProblem,
  type Failure,
  isViolationReason,
  type ProblemDecoder,
} from "@plainworks/std/failure"

/** The `reason` extension members the session routes use in their RFC 9457 problems. */
export const sessionFailureReasons = {
  invalid: "SESSION_INVALID",
  csrf: "CSRF_INVALID",
  storeUnavailable: "AUTH_STORE_UNAVAILABLE",
} as const

/**
 * Reads a session route rejection: a standard RFC 9457 problem whose `reason` extension member
 * names the cause. A store outage reports `authentication: "unavailable"`, so every protected
 * operation fails closed until the session is checked again.
 */
export const sessionFailures: ProblemDecoder = (input) => {
  const failure: Failure = decodeProblem(input)
  const reason = failure.metadata?.reason
  if (!isViolationReason(reason)) return failure
  return {
    ...failure,
    reason,
    authentication:
      reason === sessionFailureReasons.storeUnavailable ? "unavailable" : failure.authentication,
  }
}
