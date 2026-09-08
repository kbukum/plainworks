import { memoryScope, type Scope, StateConfigError } from "@plainworks/state"
import type { StateCapabilities } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { createMemorySessionStore } from "./memory-store"

// A scope that reports a non-memory capability (transmitted to the server) while reusing the memory
// backend — enough to prove the secret guard rejects it before any value is stored.
function serverScope(): Scope {
  const capabilities: StateCapabilities = {
    ...memoryScope.capabilities,
    sentToServer: true,
  }
  return {
    name: "fake-server",
    capabilities,
    createSource: memoryScope.createSource.bind(memoryScope),
  }
}

describe("createMemorySessionStore", () => {
  test("stores and reads the access token through the memory scope", async () => {
    const store = createMemorySessionStore()
    await expect(store.get()).resolves.toBeUndefined()
    await store.set("access-token-value")
    await expect(store.get()).resolves.toBe("access-token-value")
    await store.remove()
    await expect(store.get()).resolves.toBeUndefined()
  })

  test("honours a custom slot key", async () => {
    const store = createMemorySessionStore({ key: "custom" })
    await store.set("v")
    await expect(store.get()).resolves.toBe("v")
  })

  test("rejects a non-memory-equivalent scope via the secret guard", () => {
    expect(() => createMemorySessionStore({ scope: serverScope() })).toThrow(StateConfigError)
  })
})
