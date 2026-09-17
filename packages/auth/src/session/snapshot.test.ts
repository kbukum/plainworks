import { describe, expect, it } from "vitest"
import { authSnapshotOf, sessionSnapshotOf } from "./snapshot"

describe("authSnapshotOf", () => {
  it("narrows a well-formed authenticated slice", () => {
    expect(authSnapshotOf({ authenticated: true, subject: "u1", name: "Ada" })).toEqual({
      authenticated: true,
      subject: "u1",
      name: "Ada",
    })
  })

  it("keeps an authenticated slice whose name is absent or mistyped", () => {
    expect(authSnapshotOf({ authenticated: true, subject: "u1", name: 7 })).toEqual({
      authenticated: true,
      subject: "u1",
      name: null,
    })
  })

  it("falls back to anonymous for a malformed or unauthenticated slice", () => {
    expect(authSnapshotOf({ authenticated: true })).toEqual({
      authenticated: false,
      subject: null,
      name: null,
    })
    expect(authSnapshotOf(null)).toEqual({ authenticated: false, subject: null, name: null })
    expect(authSnapshotOf("nope")).toEqual({ authenticated: false, subject: null, name: null })
  })
})

describe("sessionSnapshotOf", () => {
  it("maps an authenticated slice onto the kit session snapshot", () => {
    expect(sessionSnapshotOf({ authenticated: true, subject: "u1", name: "Ada" })).toEqual({
      status: "authenticated",
      identity: { subject: "u1", claims: { name: "Ada" } },
    })
  })

  it("omits an absent name from the claims", () => {
    expect(sessionSnapshotOf({ authenticated: true, subject: "u1" })).toEqual({
      status: "authenticated",
      identity: { subject: "u1", claims: {} },
    })
  })

  it("maps anything else to an unauthenticated snapshot", () => {
    expect(sessionSnapshotOf({ authenticated: false })).toEqual({
      status: "unauthenticated",
      identity: null,
    })
  })
})
