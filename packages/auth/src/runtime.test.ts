import type { AuthContext, Identity } from "@plainworks/std"
import { manualClock } from "@plainworks/testkit"
import { describe, expect, test, vi } from "vitest"
import type { AuthAdapter } from "./adapter"
import { createAuth } from "./runtime"

const IDENTITY: Identity = { subject: "u", claims: { role: "admin" } }

function customAdapterInstance(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return { id: "custom", authenticate: async () => IDENTITY, ...overrides }
}

describe("createAuth", () => {
  test("wires a custom adapter and exposes authenticate + a header provider", async () => {
    const adapter = customAdapterInstance()
    const runtime = createAuth({ adapter: { kind: "custom", adapter }, clock: manualClock(0) })

    expect(runtime.adapter).toBe(adapter)
    expect(await runtime.authenticate({})).toBe(IDENTITY)
    // No token established yet — the header provider degrades to undefined.
    expect(await runtime.getAuthHeader()).toBeUndefined()
  })

  test("threads the adapter's refresh into the session store's lazy refresh", async () => {
    const clock = manualClock(0)
    const refresh = vi.fn(async () => ({ accessToken: "fresh", expiresAt: 120_000 }))
    const runtime = createAuth({
      adapter: { kind: "custom", adapter: customAdapterInstance({ refresh }) },
      clock,
    })

    runtime.session.setSession({ accessToken: "stale", expiresAt: 1_000, identity: IDENTITY })
    clock.set(2_000)
    expect(await runtime.getAuthHeader()).toEqual({ Authorization: "Bearer fresh" })
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  test("logout clears the session and invokes the adapter logout", async () => {
    const logout = vi.fn(async () => undefined)
    const runtime = createAuth({
      adapter: { kind: "custom", adapter: customAdapterInstance({ logout }) },
      clock: manualClock(0),
    })
    runtime.session.setSession({ accessToken: "t", expiresAt: 60_000, identity: IDENTITY })

    await runtime.logout()

    expect(runtime.session.getSnapshot().status).toBe("unauthenticated")
    expect(logout).toHaveBeenCalledTimes(1)
  })

  test("passes the AuthContext signal through the header provider", async () => {
    const runtime = createAuth({
      adapter: {
        kind: "custom",
        adapter: customAdapterInstance({
          refresh: async () => ({ accessToken: "t", expiresAt: 120_000 }),
        }),
      },
      clock: manualClock(0),
    })
    const controller = new AbortController()
    const captured: AuthContext = { signal: controller.signal }
    expect(await runtime.getAuthHeader(captured)).toEqual({ Authorization: "Bearer t" })
  })

  test("throws a typed config error for an unregistered adapter kind", () => {
    // The default registry only knows `custom`; selecting anything else fails closed.
    expect(() => createAuth({ adapter: { kind: "oidc" } as never, clock: manualClock(0) })).toThrow(
      /No auth adapter is registered/,
    )
  })
})
