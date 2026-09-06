import { describe, expect, test } from "vitest"
import type { AuthHeaderProvider, AuthHeaders } from "./auth"
import type { Listener, PlainEvent, Subscription } from "./events"

// Downstream smoke: prove the shared seams higher layers implement type-check and behave. These are the single source of truth for the auth-header contract and event shapes — connection, connect, and auth satisfy them structurally without importing one another.

describe("auth-header seam", () => {
  test("a synchronous provider resolves header-only credentials", async () => {
    const headers: AuthHeaders = { authorization: "Bearer abc" }
    const provider: AuthHeaderProvider = () => headers
    expect(await provider()).toEqual({ authorization: "Bearer abc" })
  })

  test("an async provider may resolve to undefined when unauthenticated", async () => {
    const provider: AuthHeaderProvider = async () => undefined
    expect(await provider()).toBeUndefined()
  })
})

describe("event seam", () => {
  test("a typed event carries its type and data", () => {
    const event: PlainEvent<"ping", { at: number }> = { type: "ping", data: { at: 1 } }
    expect(event.type).toBe("ping")
    expect(event.data.at).toBe(1)
  })

  test("a listener receives events and a subscription tears down", () => {
    const seen: string[] = []
    const listener: Listener<PlainEvent<"tick">> = (event) => seen.push(event.type)
    let active = true
    const subscription: Subscription = { unsubscribe: () => (active = false) }

    listener({ type: "tick", data: undefined })
    subscription.unsubscribe()

    expect(seen).toEqual(["tick"])
    expect(active).toBe(false)
  })
})
