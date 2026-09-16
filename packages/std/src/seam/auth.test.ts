import { describe, expect, test } from "vitest"
import type { AuthHeaderProvider, AuthHeaders } from "./auth"

// Downstream smoke: the auth-header seam is the single source of truth for the header-only auth
// contract, satisfied structurally by `auth`/`connect` without importing one another.

describe("auth-header seam", () => {
  test("a synchronous provider resolves header-only credentials", async () => {
    const headers: AuthHeaders = { authorization: "******" }
    const provider: AuthHeaderProvider = () => headers
    expect(await provider()).toEqual({ authorization: "******" })
  })

  test("an async provider may resolve to undefined when unauthenticated", async () => {
    const provider: AuthHeaderProvider = async () => undefined
    expect(await provider()).toBeUndefined()
  })
})
