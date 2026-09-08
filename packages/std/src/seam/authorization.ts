import type { Identity } from "./identity"

/**
 * The outcome of an authorization decision — authorization's "may this identity do this?". A bare boolean with an optional human-readable `reason` for logging and diagnostics; never the place to leak a secret.
 */
export interface Decision {
  /** Whether the action is permitted. A missing, failed, or throwing policy MUST resolve to `false`. */
  readonly allow: boolean
  /** Optional non-sensitive explanation for logs/UX — never a credential or internal detail. */
  readonly reason?: string
}

/**
 * The `(subject, action, resource)` triple an {@link Authorizer} decides over — the same vocabulary a policy engine (gokit `authz`, Cedar, OPA) speaks, without importing one.
 *
 * `resource` is `unknown` on purpose: what is being acted on is app-defined, narrowed by the policy, never framework-imposed.
 */
export interface AuthorizationRequest {
  /** The caller, or `null` when unauthenticated — a `null` identity denies by default. */
  readonly identity: Identity | null
  /** What the caller is attempting (`"post:delete"`, `"admin.read"`) — app-defined vocabulary. */
  readonly action: string
  /** What the action targets, narrowed by the policy; omitted for an action with no target. */
  readonly resource?: unknown
}

/**
 * The authorization **decision seam** — the single contract every policy satisfies, from a thin claims/role predicate to a full RBAC/ABAC engine. It lives in `std/seam` so guards, the reference policy in `@plainworks/auth`, and a future `@plainworks/authz` all consume one shape without importing each other.
 *
 * **Default-deny is a contract, not an implementation detail:** an implementation MUST resolve to `{ allow: false }` when there is no identity, the action is unknown, or the underlying policy throws. A caller that treats a rejected/absent decision as permission is a security bug — the seam is designed so the safe answer is the easy one.
 */
export type Authorizer = (request: AuthorizationRequest) => Decision | Promise<Decision>
