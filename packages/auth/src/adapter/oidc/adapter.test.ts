import { systemClock } from "@plainworks/std"
import { createMockIdp, manualClock } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { defaultAuthCrypto } from "../../crypto"
import { AuthError } from "../../errors"
import { hmacSessionSigner } from "../../server/hmac-signer"
import { createAdapterRegistry } from "../registry"
import type { AuthAdapterDeps } from "../seam"
import { oidcAdapter } from "./adapter"
import { type OidcAdapterConfig, validateOidcAdapterConfig } from "./config"
import { createRefreshTokenStore } from "./refresh-store"
import { registerOidcAdapter } from "./register"

const REDIRECT_URI = "https://app.test/auth/callback"

function signingKey(): Uint8Array {
  return new Uint8Array(32).fill(0x11)
}

function paramsFromCallback(callbackUrl: string): Record<string, string> {
  return Object.fromEntries(new URL(callbackUrl).searchParams)
}

async function buildAdapter(
  overrides: Partial<OidcAdapterConfig> = {},
  deps?: Partial<AuthAdapterDeps>,
): Promise<{
  adapter: ReturnType<typeof oidcAdapter>
  idp: Awaited<ReturnType<typeof createMockIdp>>
}> {
  const idp = await createMockIdp()
  const config: OidcAdapterConfig = {
    kind: "oidc",
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: REDIRECT_URI,
    signer: hmacSessionSigner({ keys: [signingKey()] }),
    fetch: idp.fetch,
    ...overrides,
  }
  const adapter = oidcAdapter(config, {
    crypto: defaultAuthCrypto(),
    clock: systemClock,
    ...deps,
  })
  return { adapter, idp }
}

describe("oidcAdapter happy path", () => {
  test("completes an Authorization Code + PKCE login and resolves the identity", async () => {
    const { adapter, idp } = await buildAdapter()
    const redirect = await adapter.beginLogin({ returnTo: "/dashboard" })
    expect(redirect.authorizationUrl).toContain("code_challenge_method=S256")

    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const session = await adapter.completeLogin({
      params: paramsFromCallback(callbackUrl),
      transaction: redirect.transaction,
    })

    expect(session.identity.subject).toBe("user-123")
    expect(session.tokens.accessToken).toBeTruthy()
    expect(session.tokens.expiresAt).toBeGreaterThan(0)
  })

  test("authenticate resolves the caller from a verified bearer access token", async () => {
    const { adapter, idp } = await buildAdapter()
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const session = await adapter.completeLogin({
      params: paramsFromCallback(callbackUrl),
      transaction: redirect.transaction,
    })

    const identity = await adapter.authenticate({
      headers: { Authorization: `Bearer ${session.tokens.accessToken}` },
    })
    expect(identity?.subject).toBe("user-123")
  })

  test("authenticate returns null without a bearer and for a forged token", async () => {
    const { adapter } = await buildAdapter()
    expect(await adapter.authenticate({})).toBeNull()
    expect(
      await adapter.authenticate({ headers: { Authorization: "Bearer not-a-real-token" } }),
    ).toBeNull()
  })

  test("refresh rotates to a fresh token set", async () => {
    const { adapter, idp } = await buildAdapter()
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const first = await adapter.completeLogin({
      params: paramsFromCallback(callbackUrl),
      transaction: redirect.transaction,
    })
    const refreshed = await adapter.refresh()
    expect(refreshed.accessToken).toBeTruthy()
    expect(refreshed.accessToken).not.toBe(first.tokens.accessToken)
  })

  test("refresh without a held token is a typed auth/refresh-failed error", async () => {
    const { adapter } = await buildAdapter()
    await expect(adapter.refresh()).rejects.toMatchObject({ kind: "auth/refresh-failed" })
  })

  test("detects a replayed refresh token and denies the refresh while signaling revocation", async () => {
    const inner = createRefreshTokenStore()
    const revoked: string[] = []
    let armed = false
    const tokenStore = {
      issue: (h: string, t: string) => inner.issue(h, t),
      current: (h: string) => inner.current(h),
      rotate: (h: string, p: string, n: string) =>
        armed ? ({ status: "reuse-detected" } as const) : inner.rotate(h, p, n),
      revoke: (h: string) => inner.revoke(h),
    }
    const { adapter, idp } = await buildAdapter({
      tokenStore,
      onReuseDetected: (h) => {
        revoked.push(h)
      },
    })
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const session = await adapter.completeLogin({
      params: paramsFromCallback(callbackUrl),
      transaction: redirect.transaction,
    })
    const handle = session.sessionHandle as string
    armed = true
    await expect(adapter.refresh(undefined, handle)).rejects.toMatchObject({
      kind: "auth/session-revoked",
    })
    expect(revoked).toEqual([handle])
  })

  test("treats a provider invalid_grant on refresh as reuse and signals revocation", async () => {
    const revoked: string[] = []
    // A store that never advances custody: after the provider consumes the login refresh token on
    // the first refresh, the second presents the same (now-retired) token, so the provider's own
    // reuse detection rejects it with `invalid_grant`.
    let held: string | undefined
    const tokenStore = {
      issue: (_h: string, t: string) => {
        held = t
      },
      current: () => held,
      rotate: () => ({ status: "rotated" }) as const,
      revoke: () => {
        held = undefined
      },
    }
    const { adapter, idp } = await buildAdapter({
      tokenStore,
      onReuseDetected: (h) => {
        revoked.push(h)
      },
    })
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const session = await adapter.completeLogin({
      params: paramsFromCallback(callbackUrl),
      transaction: redirect.transaction,
    })
    const handle = session.sessionHandle as string
    await adapter.refresh(undefined, handle)
    await expect(adapter.refresh(undefined, handle)).rejects.toMatchObject({
      kind: "auth/session-revoked",
    })
    expect(revoked).toEqual([handle])
  })

  test("still denies with auth/session-revoked when the revocation signal itself throws", async () => {
    const inner = createRefreshTokenStore()
    let armed = false
    const tokenStore = {
      issue: (h: string, t: string) => inner.issue(h, t),
      current: (h: string) => inner.current(h),
      rotate: (h: string, p: string, n: string) =>
        armed ? ({ status: "reuse-detected" } as const) : inner.rotate(h, p, n),
      revoke: (h: string) => inner.revoke(h),
    }
    const { adapter, idp } = await buildAdapter({
      tokenStore,
      onReuseDetected: () => {
        throw new Error("registry offline")
      },
    })
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const session = await adapter.completeLogin({
      params: paramsFromCallback(callbackUrl),
      transaction: redirect.transaction,
    })
    armed = true
    await expect(adapter.refresh(undefined, session.sessionHandle as string)).rejects.toMatchObject(
      { kind: "auth/session-revoked" },
    )
  })

  test("makes both revocation attempts and still denies when tokenStore.revoke throws", async () => {
    const inner = createRefreshTokenStore()
    const signaled: string[] = []
    let armed = false
    const tokenStore = {
      issue: (h: string, t: string) => inner.issue(h, t),
      current: (h: string) => inner.current(h),
      rotate: (h: string, p: string, n: string) =>
        armed ? ({ status: "reuse-detected" } as const) : inner.rotate(h, p, n),
      revoke: () => {
        throw new Error("token store offline")
      },
    }
    const { adapter, idp } = await buildAdapter({
      tokenStore,
      onReuseDetected: (h) => {
        signaled.push(h)
      },
    })
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const session = await adapter.completeLogin({
      params: paramsFromCallback(callbackUrl),
      transaction: redirect.transaction,
    })
    const handle = session.sessionHandle as string
    armed = true
    await expect(adapter.refresh(undefined, handle)).rejects.toMatchObject({
      kind: "auth/session-revoked",
    })
    // A failing tokenStore.revoke never skips the out-of-band signal or downgrades the deny.
    expect(signaled).toEqual([handle])
  })
})

describe("oidcAdapter failure paths", () => {
  test("rejects a tampered login transaction", async () => {
    const { adapter, idp } = await buildAdapter()
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const tampered = `${redirect.transaction}x`
    await expect(
      adapter.completeLogin({ params: paramsFromCallback(callbackUrl), transaction: tampered }),
    ).rejects.toBeInstanceOf(AuthError)
  })

  test("rejects an expired login transaction", async () => {
    const clock = manualClock(1_000_000)
    const { adapter, idp } = await buildAdapter({ transactionTtlSeconds: 60 }, { clock })
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    clock.advance(61_000)
    await expect(
      adapter.completeLogin({
        params: paramsFromCallback(callbackUrl),
        transaction: redirect.transaction,
      }),
    ).rejects.toMatchObject({ kind: "auth/adapter" })
  })

  test("rejects a mismatched state (CSRF on the authorization response)", async () => {
    const { adapter, idp } = await buildAdapter()
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const params = paramsFromCallback(callbackUrl)
    params.state = "attacker-supplied-state"
    await expect(
      adapter.completeLogin({ params, transaction: redirect.transaction }),
    ).rejects.toBeInstanceOf(AuthError)
  })

  test("rejects an authorization code replay (second redemption)", async () => {
    const { adapter, idp } = await buildAdapter()
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    const params = paramsFromCallback(callbackUrl)
    await adapter.completeLogin({ params, transaction: redirect.transaction })
    await expect(
      adapter.completeLogin({ params, transaction: redirect.transaction }),
    ).rejects.toBeInstanceOf(AuthError)
  })

  test("rejects an ID token whose nonce does not match the login transaction", async () => {
    const idp = await createMockIdp({ idTokenNonceOverride: "forged-nonce" })
    const adapter = oidcAdapter(
      {
        kind: "oidc",
        issuer: idp.issuer,
        clientId: idp.clientId,
        redirectUri: REDIRECT_URI,
        signer: hmacSessionSigner({ keys: [signingKey()] }),
        fetch: idp.fetch,
      },
      { crypto: defaultAuthCrypto(), clock: systemClock },
    )
    const redirect = await adapter.beginLogin({})
    const { callbackUrl } = idp.authorize(redirect.authorizationUrl)
    await expect(
      adapter.completeLogin({
        params: paramsFromCallback(callbackUrl),
        transaction: redirect.transaction,
      }),
    ).rejects.toMatchObject({ kind: "auth/adapter" })
  })

  test("custodies refresh tokens per session handle across concurrent users", async () => {
    const { adapter, idp } = await buildAdapter()

    // First user login
    const r1 = await adapter.beginLogin({})
    const u1 = idp.authorize(r1.authorizationUrl)
    const s1 = await adapter.completeLogin({
      params: paramsFromCallback(u1.callbackUrl),
      transaction: r1.transaction,
    })
    expect(s1.sessionHandle).toBeDefined()

    // Second user login on same adapter
    const r2 = await adapter.beginLogin({})
    const u2 = idp.authorize(r2.authorizationUrl)
    const s2 = await adapter.completeLogin({
      params: paramsFromCallback(u2.callbackUrl),
      transaction: r2.transaction,
    })
    expect(s2.sessionHandle).toBeDefined()
    expect(s2.sessionHandle).not.toBe(s1.sessionHandle)

    // First user refreshes explicitly by session handle
    const refreshed1 = await adapter.refresh(undefined, s1.sessionHandle)
    expect(refreshed1.accessToken).toBeTruthy()

    // First user logs out explicitly by session handle
    await adapter.logout(undefined, s1.sessionHandle)

    // Second user refresh is unaffected by first user's logout
    const refreshed2 = await adapter.refresh(undefined, s2.sessionHandle)
    expect(refreshed2.accessToken).toBeTruthy()

    // First user refresh now fails
    await expect(adapter.refresh(undefined, s1.sessionHandle)).rejects.toMatchObject({
      kind: "auth/refresh-failed",
    })
  })

  test("shares a single in-flight refresh exchange across concurrent callers for the same session", async () => {
    const { adapter, idp } = await buildAdapter()
    const r1 = await adapter.beginLogin({})
    const u1 = idp.authorize(r1.authorizationUrl)
    const s1 = await adapter.completeLogin({
      params: paramsFromCallback(u1.callbackUrl),
      transaction: r1.transaction,
    })

    const [tokens1, tokens2] = await Promise.all([
      adapter.refresh(undefined, s1.sessionHandle),
      adapter.refresh(undefined, s1.sessionHandle),
    ])

    expect(tokens1.accessToken).toBeTruthy()
    expect(tokens2.accessToken).toBe(tokens1.accessToken)
    expect(tokens1.expiresAt).toBe(tokens2.expiresAt)
  })

  test("caller cancellation on shared in-flight refresh does not abort other concurrent callers", async () => {
    const { adapter, idp } = await buildAdapter()
    const r1 = await adapter.beginLogin({})
    const u1 = idp.authorize(r1.authorizationUrl)
    const s1 = await adapter.completeLogin({
      params: paramsFromCallback(u1.callbackUrl),
      transaction: r1.transaction,
    })

    const controller = new AbortController()
    const refresh1 = adapter.refresh(controller.signal, s1.sessionHandle)
    const refresh2 = adapter.refresh(undefined, s1.sessionHandle)
    controller.abort()

    await expect(refresh1).rejects.toThrow()
    const tokens2 = await refresh2
    expect(tokens2.accessToken).toBeTruthy()
  })

  test("refreshes JWKS on provider signing-key rotation without process restart", async () => {
    const { adapter, idp } = await buildAdapter({ cooldownDurationMs: 0 })

    // User 1 logs in before key rotation
    const r1 = await adapter.beginLogin({})
    const u1 = idp.authorize(r1.authorizationUrl)
    const s1 = await adapter.completeLogin({
      params: paramsFromCallback(u1.callbackUrl),
      transaction: r1.transaction,
    })
    expect(s1.identity.subject).toBe("user-123")

    // Provider rotates signing key
    const { kid: newKid } = await idp.rotateSigningKey()
    expect(newKid).toBe("mock-idp-key-2")

    // User 2 logs in with tokens signed by the new key
    const r2 = await adapter.beginLogin({})
    const u2 = idp.authorize(r2.authorizationUrl)
    const s2 = await adapter.completeLogin({
      params: paramsFromCallback(u2.callbackUrl),
      transaction: r2.transaction,
    })
    expect(s2.identity.subject).toBe("user-123")
  })

  test("aborts discovery when request signal is already aborted", async () => {
    const { adapter } = await buildAdapter()
    const controller = new AbortController()
    controller.abort()
    await expect(adapter.beginLogin({ signal: controller.signal })).rejects.toThrow()
  })

  test("validates configuration and rejects invalid inputs with typed auth/config errors", async () => {
    const signer = hmacSessionSigner({ keys: [signingKey()] })
    const base = {
      kind: "oidc",
      issuer: "https://idp.test",
      clientId: "client-id",
      redirectUri: "https://app.test/cb",
      signer,
    } as const

    // Not an object or wrong kind
    expect(() => validateOidcAdapterConfig(null)).toThrowError(AuthError)
    expect(() => validateOidcAdapterConfig({ ...base, kind: "wrong" })).toThrowError(AuthError)

    // Missing or invalid issuer
    expect(() => validateOidcAdapterConfig({ ...base, issuer: "" })).toThrowError(AuthError)
    expect(() => validateOidcAdapterConfig({ ...base, issuer: "ftp://example.com" })).toThrowError(
      AuthError,
    )
    expect(() => validateOidcAdapterConfig({ ...base, issuer: "not-a-url" })).toThrowError(
      AuthError,
    )

    // Missing or empty clientId
    expect(() => validateOidcAdapterConfig({ ...base, clientId: "" })).toThrowError(AuthError)

    // Missing or invalid redirectUri
    expect(() => validateOidcAdapterConfig({ ...base, redirectUri: "" })).toThrowError(AuthError)
    expect(() => validateOidcAdapterConfig({ ...base, redirectUri: "not a url" })).toThrowError(
      AuthError,
    )

    // Missing signer or invalid methods
    expect(() => validateOidcAdapterConfig({ ...base, signer: null })).toThrowError(AuthError)
    expect(() => validateOidcAdapterConfig({ ...base, signer: {} })).toThrowError(AuthError)

    // Scopes invalid
    expect(() => validateOidcAdapterConfig({ ...base, scopes: "bad" })).toThrowError(AuthError)
    expect(() => validateOidcAdapterConfig({ ...base, scopes: [""] })).toThrowError(AuthError)

    // idTokenSigningAlgs invalid
    expect(() => validateOidcAdapterConfig({ ...base, idTokenSigningAlgs: "bad" })).toThrowError(
      AuthError,
    )
    expect(() => validateOidcAdapterConfig({ ...base, idTokenSigningAlgs: [] })).toThrowError(
      AuthError,
    )
    expect(() => validateOidcAdapterConfig({ ...base, idTokenSigningAlgs: ["none"] })).toThrowError(
      AuthError,
    )
    expect(() => validateOidcAdapterConfig({ ...base, idTokenSigningAlgs: [""] })).toThrowError(
      AuthError,
    )

    // transactionTtlSeconds invalid
    expect(() => validateOidcAdapterConfig({ ...base, transactionTtlSeconds: -1 })).toThrowError(
      AuthError,
    )

    // fetch invalid
    expect(() => validateOidcAdapterConfig({ ...base, fetch: "bad" })).toThrowError(AuthError)

    // timeoutMs invalid
    expect(() => validateOidcAdapterConfig({ ...base, timeoutMs: -1 })).toThrowError(AuthError)
    expect(() => validateOidcAdapterConfig({ ...base, timeoutMs: 1.5 })).toThrowError(AuthError)

    // cooldownDurationMs invalid
    expect(() => validateOidcAdapterConfig({ ...base, cooldownDurationMs: -1 })).toThrowError(
      AuthError,
    )
    expect(() => validateOidcAdapterConfig({ ...base, cooldownDurationMs: 1.5 })).toThrowError(
      AuthError,
    )

    // tokenStore invalid
    expect(() => validateOidcAdapterConfig({ ...base, tokenStore: "bad" })).toThrowError(AuthError)
    expect(() => validateOidcAdapterConfig({ ...base, tokenStore: {} })).toThrowError(AuthError)
  })

  test("registerOidcAdapter registers the oidc kind in AuthRegistry", () => {
    const registry = createAdapterRegistry()
    registerOidcAdapter(registry)
    expect(registry.has("oidc")).toBe(true)

    const signer = hmacSessionSigner({ keys: [signingKey()] })
    const adapter = registry.create(
      "oidc",
      {
        kind: "oidc",
        issuer: "https://idp.test",
        clientId: "client",
        redirectUri: "https://app.test/cb",
        signer,
      },
      { crypto: defaultAuthCrypto(), clock: systemClock },
    )
    expect(adapter.id).toBe("oidc")
  })

  test("aborted caller during discovery does not fail concurrent caller", async () => {
    const { adapter } = await buildAdapter()
    const abortingController = new AbortController()
    abortingController.abort()

    // Caller 1 aborts immediately
    await expect(adapter.beginLogin({ signal: abortingController.signal })).rejects.toThrow()

    // Concurrent/subsequent caller 2 succeeds
    const redirect = await adapter.beginLogin({})
    expect(redirect.authorizationUrl).toContain("response_type=code")
  })

  test("logout aborts and invalidates in-flight refresh to prevent post-logout token resurrection", async () => {
    let releaseTokenExchange: () => void = () => {}
    const tokenGate = new Promise<void>((resolve) => {
      releaseTokenExchange = resolve
    })

    let gateRefresh = false
    const idp = await createMockIdp()
    const customFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as { url: string }).url
      if (gateRefresh && url.includes("/token")) {
        await tokenGate
      }
      return idp.fetch(input, init)
    }

    const tokenStore = createRefreshTokenStore()
    const { adapter } = await buildAdapter({
      issuer: idp.issuer,
      clientId: idp.clientId,
      fetch: customFetch,
      tokenStore,
    })

    const r = await adapter.beginLogin({})
    const u = idp.authorize(r.authorizationUrl)
    const session = await adapter.completeLogin({
      params: paramsFromCallback(u.callbackUrl),
      transaction: r.transaction,
    })

    const sessionHandle = session.sessionHandle ?? "test-session"
    expect(await tokenStore.current(sessionHandle)).toBeTruthy()

    // Arm gate and start refresh (which blocks waiting for tokenGate)
    gateRefresh = true
    const refreshPromise = adapter.refresh(undefined, sessionHandle)

    // User logs out while refresh is in flight
    await adapter.logout(undefined, sessionHandle)
    expect(await tokenStore.current(sessionHandle)).toBeUndefined()

    // Release token exchange
    releaseTokenExchange()

    // Refresh should fail because session was invalidated
    await expect(refreshPromise).rejects.toThrow()

    // Token store must remain clean - NO resurrection
    expect(await tokenStore.current(sessionHandle)).toBeUndefined()
  })

  test("rejects discovery metadata with endpoints outside allowedOrigins", async () => {
    const idp = await createMockIdp()
    const customFetch: typeof fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as { url: string }).url
      if (url.includes("/.well-known/openid-configuration")) {
        return new Response(
          JSON.stringify({
            issuer: idp.issuer,
            authorization_endpoint: `${idp.issuer}/auth`,
            token_endpoint: "https://malicious.internal.service/token",
            jwks_uri: `${idp.issuer}/jwks`,
            response_types_supported: ["code"],
            id_token_signing_alg_values_supported: ["RS256"],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        )
      }
      return idp.fetch(input, init)
    }

    const { adapter } = await buildAdapter({
      issuer: idp.issuer,
      clientId: idp.clientId,
      fetch: customFetch,
      allowedOrigins: [new URL(idp.issuer).origin],
    })

    await expect(adapter.beginLogin({})).rejects.toThrowError(
      /provider token_endpoint origin "https:\/\/malicious\.internal\.service" is not allowed/,
    )
  })

  test("validates allowedOrigins configuration", () => {
    const signer = hmacSessionSigner({ keys: [signingKey()] })
    expect(() =>
      validateOidcAdapterConfig({
        kind: "oidc",
        issuer: "https://idp.test",
        clientId: "client-id",
        redirectUri: "https://app.test/cb",
        signer,
        allowedOrigins: ["not-a-url"],
      }),
    ).toThrowError(AuthError)

    expect(() =>
      validateOidcAdapterConfig({
        kind: "oidc",
        issuer: "https://idp.test",
        clientId: "client-id",
        redirectUri: "https://app.test/cb",
        signer,
        allowedOrigins: "bad" as unknown as readonly string[],
      }),
    ).toThrowError(AuthError)
  })
})
