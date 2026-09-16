import type { AuthorizationRequest, Identity } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { createAllowListPolicy, requireClaim } from "./policy"

const admin: Identity = { subject: "u1", claims: { role: "admin" } }
const member: Identity = { subject: "u2", claims: { role: "member" } }

function request(
  identity: Identity | null,
  action: string,
  resource?: unknown,
): AuthorizationRequest {
  return { identity, action, resource }
}

describe("createAllowListPolicy", () => {
  test("denies an unspecified request by default (no matching allow rule)", async () => {
    const authorize = createAllowListPolicy({ rules: [] })
    expect(await authorize(request(admin, "post:delete"))).toEqual({
      allow: false,
      reason: "forbidden",
    })
  })

  test("permits a request that a rule matches", async () => {
    const authorize = createAllowListPolicy({
      rules: [(req) => req.action === "post:read"],
    })
    expect(await authorize(request(member, "post:read"))).toEqual({ allow: true })
  })

  test("denies an unauthenticated caller before any rule runs", async () => {
    const authorize = createAllowListPolicy({ rules: [() => true] })
    expect(await authorize(request(null, "post:read"))).toEqual({
      allow: false,
      reason: "unauthenticated",
    })
  })

  test("fails closed when a rule throws (a throwing rule never permits)", async () => {
    const authorize = createAllowListPolicy({
      rules: [
        () => {
          throw new Error("policy boom")
        },
      ],
    })
    expect(await authorize(request(admin, "post:delete"))).toEqual({
      allow: false,
      reason: "forbidden",
    })
  })

  test("fails the whole decision closed when any rule throws, even if a later rule would match", async () => {
    const authorize = createAllowListPolicy({
      rules: [
        () => {
          throw new Error("boom")
        },
        (req) => req.action === "post:delete",
      ],
    })
    expect(await authorize(request(admin, "post:delete"))).toEqual({
      allow: false,
      reason: "forbidden",
    })
  })

  test("carries a custom, non-secret deny reason", async () => {
    const authorize = createAllowListPolicy({ rules: [], denyReason: "not-in-tenant" })
    expect(await authorize(request(member, "x"))).toEqual({
      allow: false,
      reason: "not-in-tenant",
    })
  })
})

describe("requireClaim", () => {
  test("matches when the identity claim satisfies the predicate", () => {
    const rule = requireClaim("role", (value) => value === "admin")
    expect(rule(request(admin, "post:delete"))).toBe(true)
    expect(rule(request(member, "post:delete"))).toBe(false)
  })

  test("does not match when the identity is absent", () => {
    const rule = requireClaim("role", () => true)
    expect(rule(request(null, "post:delete"))).toBe(false)
  })

  test("composes as an allow rule inside a default-deny policy", async () => {
    const authorize = createAllowListPolicy({
      rules: [requireClaim("role", (value) => value === "admin")],
    })
    expect(await authorize(request(admin, "post:delete"))).toEqual({ allow: true })
    expect(await authorize(request(member, "post:delete"))).toEqual({
      allow: false,
      reason: "forbidden",
    })
  })
})
