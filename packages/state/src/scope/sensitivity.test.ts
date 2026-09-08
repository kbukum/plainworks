// Default `node` environment: the secret guard is capability-only (no host), so it is provable here
// without a browser — the same guard the client scoped composer and auth's TMB fallback reuse.
import type { StateCapabilities } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { StateConfigError } from "../errors"
import { memoryScope } from "./memory"
import type { Scope } from "./scope"
import { assertScopeAllowsSensitivity, isMemoryEquivalent } from "./sensitivity"

function scopeWith(name: string, capabilities: Partial<StateCapabilities>): Scope {
  return {
    name,
    capabilities: {
      access: "sync",
      authority: "local",
      durable: false,
      sharedAcrossTabs: false,
      sentToServer: false,
      availableAtImport: true,
      ...capabilities,
    },
    createSource: memoryScope.createSource.bind(memoryScope),
  }
}

describe("isMemoryEquivalent", () => {
  test("accepts the memory scope", () => {
    expect(isMemoryEquivalent(memoryScope.capabilities)).toBe(true)
  })

  test("rejects a scope that fails any single axis", () => {
    expect(isMemoryEquivalent(scopeWith("durable", { durable: true }).capabilities)).toBe(false)
    expect(isMemoryEquivalent(scopeWith("wire", { sentToServer: true }).capabilities)).toBe(false)
    expect(isMemoryEquivalent(scopeWith("tabs", { sharedAcrossTabs: true }).capabilities)).toBe(
      false,
    )
    expect(isMemoryEquivalent(scopeWith("remote", { authority: "remote" }).capabilities)).toBe(
      false,
    )
    expect(isMemoryEquivalent(scopeWith("late", { availableAtImport: false }).capabilities)).toBe(
      false,
    )
  })
})

describe("assertScopeAllowsSensitivity", () => {
  test("is a no-op for non-secret values in any scope", () => {
    expect(() =>
      assertScopeAllowsSensitivity("field", scopeWith("cookie", { sentToServer: true }), undefined),
    ).not.toThrow()
  })

  test("allows a secret only in a memory-equivalent scope", () => {
    expect(() => assertScopeAllowsSensitivity("token", memoryScope, "secret")).not.toThrow()
  })

  test("rejects a secret in a non-memory scope with a typed config error", () => {
    expect(() =>
      assertScopeAllowsSensitivity("token", scopeWith("cookie", { sentToServer: true }), "secret"),
    ).toThrow(StateConfigError)
  })
})
