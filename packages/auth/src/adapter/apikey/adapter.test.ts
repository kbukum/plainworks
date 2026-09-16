import type { Identity } from "@plainworks/std"
import { systemClock } from "@plainworks/std"
import { describe, expect, test, vi } from "vitest"
import { defaultAuthCrypto } from "../../crypto"
import { AuthError } from "../../errors"
import type { AuthAdapterDeps } from "../adapter"
import { apiKeyAdapter } from "./adapter"
import { type ApiKeyVerifier, validateApiKeyAdapterConfig } from "./config"

const deps: AuthAdapterDeps = { crypto: defaultAuthCrypto(), clock: systemClock }
const known: Record<string, Identity> = {
  "secret-key": { subject: "svc-1", claims: { plan: "pro" } },
}
const lookup: ApiKeyVerifier = (key) => known[key] ?? null

describe("apiKeyAdapter.authenticate", () => {
  test("resolves the identity a known key maps to", async () => {
    const adapter = apiKeyAdapter({ kind: "apikey", verify: lookup }, deps)
    const identity = await adapter.authenticate({ headers: { "X-API-Key": "secret-key" } })
    expect(identity?.subject).toBe("svc-1")
    expect(identity?.claims.plan).toBe("pro")
  })

  test("returns null for an unknown key or a missing header", async () => {
    const adapter = apiKeyAdapter({ kind: "apikey", verify: lookup }, deps)
    expect(await adapter.authenticate({ headers: { "X-API-Key": "nope" } })).toBeNull()
    expect(await adapter.authenticate({ headers: { "X-API-Key": "" } })).toBeNull()
    expect(await adapter.authenticate({})).toBeNull()
  })

  test("reads the key header case-insensitively and honors a custom header name", async () => {
    const lower = apiKeyAdapter({ kind: "apikey", verify: lookup }, deps)
    expect((await lower.authenticate({ headers: { "x-api-key": "secret-key" } }))?.subject).toBe(
      "svc-1",
    )
    const custom = apiKeyAdapter({ kind: "apikey", verify: lookup, headerName: "X-Token" }, deps)
    expect((await custom.authenticate({ headers: { "X-Token": "secret-key" } }))?.subject).toBe(
      "svc-1",
    )
    // The default header is not consulted when a custom one is configured.
    expect(await custom.authenticate({ headers: { "X-API-Key": "secret-key" } })).toBeNull()
  })

  test("passes the key and cancellation signal through to the verifier", async () => {
    const verify = vi.fn<ApiKeyVerifier>((key) => known[key] ?? null)
    const adapter = apiKeyAdapter({ kind: "apikey", verify }, deps)
    const controller = new AbortController()
    await adapter.authenticate({
      headers: { "X-API-Key": "secret-key" },
      signal: controller.signal,
    })
    expect(verify).toHaveBeenCalledWith("secret-key", controller.signal)
  })

  test("propagates a verifier infrastructure fault rather than swallowing it into a deny", async () => {
    const verify: ApiKeyVerifier = () => {
      throw new AuthError("auth/adapter", "key store unavailable")
    }
    const adapter = apiKeyAdapter({ kind: "apikey", verify }, deps)
    await expect(
      adapter.authenticate({ headers: { "X-API-Key": "secret-key" } }),
    ).rejects.toThrowError(AuthError)
  })
})

describe("validateApiKeyAdapterConfig", () => {
  test("accepts a well-formed config", () => {
    expect(validateApiKeyAdapterConfig({ kind: "apikey", verify: lookup }).kind).toBe("apikey")
  })

  test("rejects malformed configuration", () => {
    expect(() => validateApiKeyAdapterConfig(null)).toThrowError(AuthError)
    expect(() => validateApiKeyAdapterConfig({ kind: "nope", verify: lookup })).toThrowError(
      AuthError,
    )
    expect(() => validateApiKeyAdapterConfig({ kind: "apikey" })).toThrowError(AuthError)
    expect(() => validateApiKeyAdapterConfig({ kind: "apikey", verify: "x" })).toThrowError(
      AuthError,
    )
    expect(() =>
      validateApiKeyAdapterConfig({ kind: "apikey", verify: lookup, headerName: "" }),
    ).toThrowError(AuthError)
    expect(() =>
      validateApiKeyAdapterConfig({ kind: "apikey", verify: lookup, headerName: 42 }),
    ).toThrowError(AuthError)
  })
})
