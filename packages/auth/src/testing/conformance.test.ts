import { describe, test } from "vitest"
import { createRefreshTokenStore } from "../adapter/oidc/refresh-store"
import { createMemorySessionStore } from "../server/opaque-store"
import { createOpaqueSessionStoreCases, createRefreshTokenStoreCases } from "."

describe("memory OpaqueSessionStore", () => {
  for (const c of createOpaqueSessionStoreCases()) {
    test(c.name, () =>
      c.run((options) => ({ store: createMemorySessionStore(options), close() {} })),
    )
  }
})

describe("memory RefreshTokenStore", () => {
  for (const c of createRefreshTokenStoreCases()) {
    test(c.name, () =>
      c.run((options) => ({ store: createRefreshTokenStore(options), close() {} })),
    )
  }
})
