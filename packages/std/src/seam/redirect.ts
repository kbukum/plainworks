/**
 * A host-neutral instruction to send the caller elsewhere — raised by a route guard when access is
 * denied and the caller should be redirected (e.g. to a login page), rather than shown a hard
 * error.
 *
 * It carries no host primitive: `@plainworks/auth`'s router adapters translate it into the redirect
 * mechanism of whatever router is in play (TanStack Router `beforeLoad`, a React Router loader,
 * Next middleware, an SPA `navigate`), so the guard logic stays testable and router-free.
 * The `to` target is sanitized to a same-origin/relative reference by the guard that produces it —
 * an open redirect is a security bug, not the consumer's problem.
 */
export interface RedirectSignal {
  /** Where to send the caller — a same-origin/relative reference, sanitized at the guard boundary. */
  readonly to: string
  /** Non-sensitive reason for the redirect (`"unauthenticated"`), for logging and diagnostics. */
  readonly reason: string
}
