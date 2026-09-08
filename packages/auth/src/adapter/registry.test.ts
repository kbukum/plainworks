import type { Identity } from "@plainworks/std"
import { manualClock } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { defaultAuthCrypto } from "../crypto"
import { AuthError } from "../errors"
import type { AuthAdapter, AuthAdapterDeps } from "./adapter"
import { CUSTOM_ADAPTER_KIND, customAdapter } from "./custom"
import { createAdapterRegistry } from "./registry"

const DEPS: AuthAdapterDeps = { crypto: defaultAuthCrypto(), clock: manualClock(0) }

function stubAdapter(id: string): AuthAdapter {
  const identity: Identity = { subject: id, claims: {} }
  return { id, authenticate: async () => identity }
}

describe("createAdapterRegistry", () => {
  test("the first registration becomes the default", () => {
    const registry = createAdapterRegistry()
    expect(registry.defaultKind).toBeUndefined()
    registry.register("oidc", () => stubAdapter("oidc"))
    registry.register("jwt", () => stubAdapter("jwt"))
    expect(registry.defaultKind).toBe("oidc")
  })

  test("rejects a duplicate registration rather than silently overriding", () => {
    const registry = createAdapterRegistry()
    registry.register("oidc", () => stubAdapter("oidc"))
    expect(() => registry.register("oidc", () => stubAdapter("other"))).toThrowError(AuthError)
    expect(() => registry.register("oidc", () => stubAdapter("other"))).toThrow(
      /already registered/,
    )
  })

  test("create builds the adapter from its factory", () => {
    const registry = createAdapterRegistry()
    registry.register("jwt", (_config, deps) => {
      expect(deps).toBe(DEPS)
      return stubAdapter("jwt")
    })
    expect(registry.create("jwt", {}, DEPS).id).toBe("jwt")
    expect(registry.has("jwt")).toBe(true)
  })

  test("create throws a typed error for an unknown kind", () => {
    const registry = createAdapterRegistry()
    expect(() => registry.create("nope", {}, DEPS)).toThrowError(AuthError)
    expect(() => registry.create("nope", {}, DEPS)).toThrow(/No auth adapter is registered/)
    expect(registry.has("nope")).toBe(false)
  })
})

describe("customAdapter pass-through", () => {
  test("registered under the custom kind, it returns the supplied adapter verbatim", () => {
    const registry = createAdapterRegistry()
    registry.register(CUSTOM_ADAPTER_KIND, customAdapter)
    const supplied = stubAdapter("mine")
    const built = registry.create(CUSTOM_ADAPTER_KIND, { kind: "custom", adapter: supplied }, DEPS)
    expect(built).toBe(supplied)
  })

  test("rejects a custom config with no adapter", () => {
    expect(() => customAdapter({ kind: "custom" }, DEPS)).toThrowError(AuthError)
  })
})
