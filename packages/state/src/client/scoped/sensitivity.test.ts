// Default `node` environment: the secret guard runs at construction and reads scope capabilities
// only (no host), so it is provable without a browser.

import { describe, expect, test } from "vitest"
import { StateConfigError } from "../../errors"
import { memoryScope } from "../../scope/memory"
import type { Scope } from "../../scope/scope"
import { cookieScope } from "../scope/cookie"
import { urlScope } from "../scope/url"
import { persistentScope, sessionScope } from "../scope/web-storage"
import { createScopedObject } from "./scoped-object"
import { createScopedState } from "./scoped-state"

// Every non-memory built-in scope: each reaches storage a script, the server, or a bystander can
// read.
const nonMemoryScopes: Array<[string, Scope]> = [
  ["persistent", persistentScope],
  ["session", sessionScope],
  ["cookie", cookieScope],
  ["url", urlScope],
]

describe("secret guard — createScopedState", () => {
  test.each(nonMemoryScopes)("rejects a secret in the %s scope at construction", (_name, scope) => {
    expect(() =>
      createScopedState<string>({ scope, key: "token", initial: "", sensitivity: "secret" }),
    ).toThrow(StateConfigError)
  })

  test("accepts a secret in the memory scope", () => {
    expect(() =>
      createScopedState<string>({
        scope: memoryScope,
        key: "token",
        initial: "",
        sensitivity: "secret",
      }),
    ).not.toThrow()
  })

  test("a non-secret value is allowed in any scope", () => {
    expect(() =>
      createScopedState<string>({ scope: persistentScope, key: "theme", initial: "light" }),
    ).not.toThrow()
  })
})

describe("secret guard — createScopedObject", () => {
  test.each(nonMemoryScopes)("rejects a secret field in the %s scope", (_name, scope) => {
    expect(() =>
      createScopedObject<{ token: string }>({
        fields: { token: { scope, initial: "", sensitivity: "secret" } },
      }),
    ).toThrow(StateConfigError)
  })

  test("accepts a secret field in the memory scope alongside non-secret fields", () => {
    expect(() =>
      createScopedObject<{ token: string; theme: string }>({
        fields: {
          token: { scope: memoryScope, initial: "", sensitivity: "secret" },
          theme: { scope: persistentScope, initial: "light" },
        },
      }),
    ).not.toThrow()
  })
})
