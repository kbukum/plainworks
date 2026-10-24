import { describe, expect, test } from "vitest"
import {
  admitLogin,
  admitSession,
  MAX_LOGIN_LIFETIME_MS,
  MAX_SESSION_LIFETIME_MS,
  REVOCATION_RETENTION_MS,
  sessionStoreCapacity,
} from "./policy"

const now = 1_000

describe("admitSession", () => {
  test("starts a new family for a first generation and retains it past expiry", () => {
    const expiresAt = now + MAX_SESSION_LIFETIME_MS
    expect(admitSession({ reference: "a", expiresAt }, undefined, undefined, now)).toEqual({
      family: "a",
      retainUntil: expiresAt + REVOCATION_RETENTION_MS,
    })
  })

  test("a rotation inherits the family and must keep the absolute expiry", () => {
    const current = { family: "a", expiresAt: now + 60_000 }
    expect(admitSession({ reference: "b", expiresAt: now + 60_000 }, "a", current, now)).toEqual({
      family: "a",
      retainUntil: now + 60_000 + REVOCATION_RETENTION_MS,
    })
    expect(() =>
      admitSession({ reference: "b", expiresAt: now + 120_000 }, "a", current, now),
    ).toThrow(expect.objectContaining({ kind: "auth/session-invalid" }))
  })

  test("a rotation from a generation that is no longer live lost a race", () => {
    expect(() =>
      admitSession({ reference: "b", expiresAt: now + 60_000 }, "a", undefined, now),
    ).toThrow(expect.objectContaining({ kind: "auth/session-revoked" }))
  })

  test("rejects an expiry in the past or beyond the session lifetime", () => {
    for (const expiresAt of [now, now - 1, now + MAX_SESSION_LIFETIME_MS + 1, Number.NaN]) {
      expect(() => admitSession({ reference: "a", expiresAt }, undefined, undefined, now)).toThrow(
        expect.objectContaining({ kind: "auth/session-invalid" }),
      )
    }
  })
})

describe("admitLogin", () => {
  test("accepts an expiry within the login lifetime and rejects anything else", () => {
    expect(() => admitLogin(now + MAX_LOGIN_LIFETIME_MS, now)).not.toThrow()
    for (const expiresAt of [now, now + MAX_LOGIN_LIFETIME_MS + 1, Number.NaN]) {
      expect(() => admitLogin(expiresAt, now)).toThrow(
        expect.objectContaining({ kind: "auth/login-transaction" }),
      )
    }
  })
})

describe("sessionStoreCapacity", () => {
  test("defaults to 1024 sessions and 256 logins", () => {
    expect(sessionStoreCapacity({})).toEqual({ sessions: 1024, logins: 256 })
    expect(sessionStoreCapacity({ capacity: 2, transactionCapacity: 1 })).toEqual({
      sessions: 2,
      logins: 1,
    })
  })

  test("rejects a capacity that is not a positive integer", () => {
    for (const options of [{ capacity: 0 }, { transactionCapacity: -1 }, { capacity: 1.5 }]) {
      expect(() => sessionStoreCapacity(options)).toThrow(
        expect.objectContaining({ kind: "auth/config" }),
      )
    }
  })
})
