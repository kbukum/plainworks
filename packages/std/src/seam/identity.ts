/**
 * The resolved caller — the answer to authentication's "who is the caller?". Produced on the server by an auth adapter and carried through the kit; the client only ever sees this identity and its claims, never the credential that produced it.
 *
 * `claims` is deliberately `Readonly<Record<string, unknown>>`, not a fixed shape: an app's identity model, role set, and token vocabulary belong to the app, not the framework. A consumer narrows a claim with its own predicate (`typeof claims.role === "string"`) — never `any`, never a framework-imposed schema.
 *
 * This lives in `std/seam` (the bottom layer) so both authentication (which resolves it) and authorization (which reads it) share one contract, and a future `@plainworks/authz` can consume it without importing `@plainworks/auth`.
 */
export interface Identity {
  /** Stable, unique principal identifier (the token `sub`, a user id, a service name). */
  readonly subject: string
  /** Verified claims about the principal — app-owned vocabulary, narrowed by consumer predicates. */
  readonly claims: Readonly<Record<string, unknown>>
}
