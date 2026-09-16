import type { Decision, RedirectSignal } from "@plainworks/std"
import { sanitizeReturnTo } from "../redirect/sanitize"

/** How a caller who fails authorization is handled. */
export interface AuthzGuardConfig {
  /**
   * Path-absolute route a denied caller is redirected to (e.g. `/forbidden`), sanitized against
   * open-redirect the same way any target is. Omit to deny in place without a redirect — the
   * caller decides how to render the refusal (a `403`, an inline message).
   */
  readonly forbiddenPath?: string
}

/**
 * The outcome of an authorization guard over a {@link Decision}: either the route is permitted, or
 * it is forbidden — optionally carrying a same-origin {@link RedirectSignal} to a forbidden
 * route. A discriminated union so a caller must handle the deny branch to reach the route.
 */
export type AuthzOutcome =
  | { readonly allow: true }
  | { readonly allow: false; readonly reason?: string; readonly redirect?: RedirectSignal }

/**
 * Turn a resolved {@link Decision} into a typed allow/deny {@link AuthzOutcome} — the authz
 * counterpart to `guardSession`. Router-free and host-neutral: it produces the seam value only, so
 * the same logic is testable and a router adapter translates a `redirect` into an actual
 * navigation. The caller awaits the (possibly async) {@link Authorizer} and hands the decision in.
 */
export function guardDecision(decision: Decision, config?: AuthzGuardConfig): AuthzOutcome {
  if (decision.allow) {
    return { allow: true }
  }
  const outcome: { allow: false; reason?: string; redirect?: RedirectSignal } = { allow: false }
  if (decision.reason !== undefined) {
    outcome.reason = decision.reason
  }
  if (config?.forbiddenPath !== undefined) {
    outcome.redirect = { to: sanitizeReturnTo(config.forbiddenPath), reason: "forbidden" }
  }
  return outcome
}
