---
"@plainworks/auth": patch
---

Complete the authorization half of auth: a default-deny reference policy and client gates over the existing `std` decision seam.

- **`createAllowListPolicy`** — a default-deny `Authorizer`: a request is denied unless one of the injected allow rules matches. Fail-closed at every edge (a `null` identity denies before any rule runs, a rule that throws denies the whole decision immediately, an unmatched request denies), with a `requireClaim` helper for the common claim check.
- **`guardDecision`** — the authz counterpart to `guardSession`: turns a resolved decision into a typed allow/forbidden outcome, optionally carrying a sanitized same-origin redirect to a forbidden route. Router-free and host-neutral.
- **`createAuthGates`** — client `<RequireAuth>` and `<Can>` gates bound to a session context. `Can` resolves a sync-or-async authorizer and stays default-deny until it does, so protected content never flashes. UX affordances only — the server session gate stays the real boundary, and neither gate touches a token.
