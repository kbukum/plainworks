import type { AuthorizationRequest, Authorizer, Identity } from "@plainworks/std"

/**
 * A single allow rule evaluated against a request. Returns `true` to permit it. A rule that throws
 * fails the whole decision closed: the seam's {@link Authorizer} contract requires a throwing
 * policy to resolve to deny, so a broken rule denies immediately rather than being skipped or
 * granting.
 */
export type AllowRule = (request: AuthorizationRequest) => boolean

/** Construction options for {@link createAllowListPolicy}. */
export interface AllowListPolicyConfig {
  /**
   * Ordered allow rules. The request is permitted the moment any rule matches; if none match it is
   * denied. An empty list denies everything — the safe default.
   */
  readonly rules: readonly AllowRule[]
  /** Non-secret reason attached to a denial for logs and diagnostics. Defaults to `"forbidden"`. */
  readonly denyReason?: string
}

const DEFAULT_DENY_REASON = "forbidden"

/**
 * Build a **default-deny** reference {@link Authorizer}: the request is denied unless one of the
 * injected allow `rules` matches. It is the simplest policy that honors the seam's default-deny
 * contract without pulling in a full RBAC/ABAC engine — a real policy engine stays BYO behind the
 * same seam.
 *
 * A factory, never a module-level singleton, so each request/tenant can build its own rule set. The
 * decision is fail-closed at every edge: a `null` identity denies before any rule runs, a rule that
 * throws denies the whole decision immediately, and an unmatched request denies.
 */
export function createAllowListPolicy(config: AllowListPolicyConfig): Authorizer {
  const rules = config.rules
  const denyReason = config.denyReason ?? DEFAULT_DENY_REASON
  return (request) => {
    if (request.identity === null) {
      return { allow: false, reason: "unauthenticated" }
    }
    for (const rule of rules) {
      let matched: boolean
      try {
        matched = rule(request)
      } catch {
        // A throwing rule fails the whole policy closed, per the Authorizer seam contract.
        return { allow: false, reason: denyReason }
      }
      if (matched) {
        return { allow: true }
      }
    }
    return { allow: false, reason: denyReason }
  }
}

/**
 * An {@link AllowRule} that permits the request when the caller's `claims[key]` satisfies
 * `matches`. Claims are app-owned `unknown` values, so the caller supplies the predicate that
 * narrows one (`(value) => value === "admin"`) — never a framework-imposed schema. An absent
 * identity never matches.
 */
export function requireClaim(key: string, matches: (value: unknown) => boolean): AllowRule {
  return (request) => {
    const identity: Identity | null = request.identity
    return identity !== null && matches(identity.claims[key])
  }
}
