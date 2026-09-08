import { describe, expect, test } from "vitest"
import type { AuthorizationRequest, Authorizer, Decision } from "./authorization"
import type { Identity } from "./identity"
import type { RedirectSignal } from "./redirect"

// Downstream smoke: prove the authorization/identity/redirect seams type-check and that a
// conforming implementation can honor the default-deny contract. These are the single source of
// truth the reference policy in `@plainworks/auth` and a future `@plainworks/authz` satisfy.

describe("identity seam", () => {
  test("an identity carries a subject and app-owned claims narrowed by a predicate", () => {
    const identity: Identity = { subject: "user-1", claims: { role: "admin" } }
    const role = typeof identity.claims.role === "string" ? identity.claims.role : undefined
    expect(identity.subject).toBe("user-1")
    expect(role).toBe("admin")
  })
})

describe("authorization seam", () => {
  // A minimal default-deny policy: allow only when the identity carries the required role.
  const requireRole =
    (role: string): Authorizer =>
    (request: AuthorizationRequest): Decision => {
      if (request.identity === null) return { allow: false, reason: "unauthenticated" }
      return request.identity.claims.role === role
        ? { allow: true }
        : { allow: false, reason: "forbidden" }
    }

  test("denies an unauthenticated caller by default", async () => {
    const authorize = requireRole("admin")
    expect(await authorize({ identity: null, action: "post:delete" })).toEqual({
      allow: false,
      reason: "unauthenticated",
    })
  })

  test("allows an identity that satisfies the policy", async () => {
    const authorize = requireRole("admin")
    const identity: Identity = { subject: "u", claims: { role: "admin" } }
    expect(await authorize({ identity, action: "post:delete", resource: { id: 1 } })).toEqual({
      allow: true,
    })
  })
})

describe("redirect seam", () => {
  test("a redirect signal carries a same-origin target and a reason", () => {
    const signal: RedirectSignal = { to: "/login", reason: "unauthenticated" }
    expect(signal.to.startsWith("/")).toBe(true)
    expect(signal.reason).toBe("unauthenticated")
  })
})
