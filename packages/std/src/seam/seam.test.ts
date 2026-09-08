import { describe, expect, test } from "vitest"
import type { AuthHeaderProvider, AuthHeaders } from "./auth"
import type { Listener, PlainEvent, Subscription } from "./events"
import type { StateCapabilities, StateSerializer, StateSource } from "./state"

// Downstream smoke: prove the shared seams higher layers implement type-check and behave.
// These are the single source of truth for the auth-header contract and event shapes — connection,
// connect, and auth satisfy them structurally without importing one another.

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

describe("state-source seam", () => {
  // A trivial synchronous backend: one in-memory slot behind the async-first contract.
  function memorySlot<Value>(): StateSource<Value> {
    let current: Value | undefined
    const listeners = new Set<() => void>()
    const notify = () => {
      for (const listener of [...listeners]) listener()
    }
    const capabilities: StateCapabilities = {
      access: "sync",
      authority: "local",
      durable: false,
      sharedAcrossTabs: false,
      sentToServer: false,
      availableAtImport: true,
    }
    return {
      capabilities,
      get: async () => current,
      set: async (value) => {
        current = value
        notify()
      },
      remove: async () => {
        current = undefined
        notify()
      },
      subscribe(onChange) {
        listeners.add(onChange)
        return { unsubscribe: () => listeners.delete(onChange) }
      },
    }
  }

  test("a synchronous backend satisfies the async-first contract and notifies on write", async () => {
    const source = memorySlot<number>()
    const seen: (number | undefined)[] = []
    const sub: Subscription = source.subscribe(() => {
      void source.get().then((value) => seen.push(value))
    })

    expect(await source.get()).toBeUndefined()
    await source.set(7)
    expect(await source.get()).toBe(7)
    await source.remove()
    expect(await source.get()).toBeUndefined()

    sub.unsubscribe()
    await source.set(9)
    // Flush the pending microtask reads from the two notifications received before teardown.
    await Promise.resolve()
    expect(seen).toEqual([7, undefined])
  })

  test("capabilities describe the backend without a scope-name branch", () => {
    const cookieLike: StateCapabilities = {
      access: "sync",
      authority: "local",
      durable: true,
      sharedAcrossTabs: false,
      sentToServer: true,
      availableAtImport: false,
    }
    // A consumer decides behavior from data (is it safe for a secret?) not from a string name.
    expect(cookieLike.sentToServer).toBe(true)
  })

  test("a serializer round-trips a value and rejects malformed input", () => {
    const serializer: StateSerializer<{ n: number }> = {
      serialize: (value) => JSON.stringify(value),
      deserialize: (raw) => JSON.parse(raw) as { n: number },
    }
    expect(serializer.deserialize(serializer.serialize({ n: 1 }))).toEqual({ n: 1 })
    expect(() => serializer.deserialize("{not json")).toThrow()
  })
})
