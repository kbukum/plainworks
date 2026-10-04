import { base64urlEncode } from "@plainworks/std/encoding"
import { type Clock, systemClock } from "@plainworks/std/time"
import type { WebFetch, WebResponse } from "@plainworks/std/web"
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose"
import {
  createMemoryMockIdpState,
  type MockIdpData,
  type MockIdpSigningKey,
  type MockIdpState,
} from "./state"

/**
 * A signing algorithm the {@link MockIdp} mints tokens under. Both are asymmetric (a
 * JWKS-verifiable public key), so a consumer verifies the token exactly as it would a real
 * provider's — `none` is never an option.
 */
export type MockIdpAlg = "RS256" | "ES256"

/** How to build a {@link MockIdp}. Every field has a deterministic default so a test can omit it. */
export interface MockIdpOptions {
  /** Borrowed fixture custody. Omit for an isolated, provider-owned memory store. */
  readonly state?: MockIdpState
  /** Issuer identifier (no trailing slash); defaults to `https://idp.test`. */
  readonly issuer?: string
  /** The audience the tokens are minted for — the relying-party client id; defaults to `test-client`. */
  readonly clientId?: string
  /** The `sub` claim every token carries; defaults to `user-123`. */
  readonly subject?: string
  /** Extra ID-token claims (e.g. `email`, `name`) merged into the minted token. */
  readonly claims?: Readonly<Record<string, unknown>>
  /** The JWS algorithm tokens are signed under; defaults to `RS256`. */
  readonly alg?: MockIdpAlg
  /** Access-token lifetime advertised as `expires_in`; defaults to 300 seconds. */
  readonly accessTokenTtlSeconds?: number
  /**
   * Force every minted ID token to carry this `nonce` instead of the one bound at authorization —
   * drives the nonce-mismatch (replay) failure path. Omit for correct, request-bound behaviour.
   */
  readonly idTokenNonceOverride?: string
  /** Clock for token `iat`/`exp` and minted ids; defaults to `systemClock`. */
  readonly clock?: Clock
}

/** The callback the provider would redirect the user agent back to after a successful authorization. */
export interface MockAuthorizeResult {
  /** The minted authorization `code`. */
  readonly code: string
  /** The `state` echoed straight back from the request. */
  readonly state: string
  /** The full redirect-back URL (`{redirect_uri}?code=...&state=...`). */
  readonly callbackUrl: string
}

/**
 * A deterministic, in-process OpenID Provider double. It mints **real, JWKS-verifiable** tokens
 * with `jose`, so a consumer's OIDC adapter runs its genuine Authorization Code + PKCE + nonce +
 * token-verification path — the only thing faked is the network. It exposes a {@link WebFetch} the
 * adapter's `fetch` seam consumes (discovery, JWKS, and the token endpoint) plus an
 * {@link MockIdp.authorize} helper that stands in for the user-agent's visit to the authorization
 * endpoint. No MSW, no real sockets — build one with {@link createMockIdp}.
 */
export interface MockIdp {
  /** Release the provider; borrowed state remains owned by its caller. */
  close(): void
  /** The issuer identifier this provider advertises. */
  readonly issuer: string
  /** The relying-party client id its tokens are minted for. */
  readonly clientId: string
  /** The `fetch` seam the adapter is configured with (discovery, JWKS, token endpoint). */
  readonly fetch: WebFetch
  /**
   * Stand in for the user-agent authorization leg: consume the adapter's authorization URL, bind a
   * fresh `code` to its PKCE `code_challenge` and `nonce`, and return the callback URL the provider
   * would redirect the browser back to. Throws when the URL omits PKCE `S256`.
   */
  authorize(authorizationUrl: string): MockAuthorizeResult
  /**
   * Reject the **next** token exchange with an `invalid_grant` error, once, to drive a provider
   * failure-path test without tearing the provider down.
   */
  failNextTokenExchange(): void
  /**
   * Rotate the provider signing keypair: future tokens are minted with the new key and both the old
   * and new public keys are published in the JWKS document.
   */
  rotateSigningKey(): Promise<{ kid: string }>
}

const DEFAULT_ISSUER = "https://idp.test"
const DEFAULT_CLIENT_ID = "test-client"
const DEFAULT_SUBJECT = "user-123"
const DEFAULT_ACCESS_TTL_SECONDS = 300

interface SubtleLike {
  digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>
}

// Lazy Web Crypto resolution for the PKCE challenge check — `crypto.subtle` is a Web Standard on
// every runtime a test runs under, but the portability shim does not declare it, so this is the one
// feature-detected access (mirroring `@plainworks/auth`'s own crypto seam).
function resolveSubtle(): SubtleLike {
  const candidate = (globalThis as { crypto?: { subtle?: unknown } }).crypto
  if (candidate?.subtle !== undefined && candidate.subtle !== null) {
    return candidate.subtle as SubtleLike
  }
  throw new Error("mock IdP requires Web Crypto (crypto.subtle) in this runtime")
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await resolveSubtle().digest("SHA-256", new TextEncoder().encode(value))
  return base64urlEncode(new Uint8Array(digest))
}

function jsonResponse(body: unknown, status = 200): WebResponse {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }) as unknown as WebResponse
}

/**
 * Build a {@link MockIdp}. Generates a fresh signing keypair, so each provider is isolated and no
 * key material is shared across tests. Async because key generation is.
 */
export async function createMockIdp(options: MockIdpOptions = {}): Promise<MockIdp> {
  const issuer = options.issuer ?? DEFAULT_ISSUER
  const clientId = options.clientId ?? DEFAULT_CLIENT_ID
  const subject = options.subject ?? DEFAULT_SUBJECT
  const alg = options.alg ?? "RS256"
  const accessTtl = options.accessTokenTtlSeconds ?? DEFAULT_ACCESS_TTL_SECONDS
  const clock = options.clock ?? systemClock
  const extraClaims = options.claims ?? {}

  const state = options.state ?? createMemoryMockIdpState()
  let closed = false
  const transact = <Value>(operation: (data: MockIdpData) => Value): Value => {
    if (closed) throw new Error("mock IdP is closed")
    return state.transact((data) => {
      const now = clock.now()
      data.codes = data.codes.filter((code) => code.expiresAt > now)
      data.refresh = data.refresh.filter((token) => token.expiresAt > now)
      data.keys = data.keys.filter(
        (key, index) => index === data.keys.length - 1 || key.expiresAt > now,
      )
      return operation(data)
    })
  }
  const mint = (data: MockIdpData, prefix: string): string => {
    data.counter += 1
    return `${prefix}-${data.counter}-${clock.now()}`
  }
  const identity = JSON.stringify([issuer, clientId, subject, alg])
  function currentKey(data: MockIdpData): MockIdpSigningKey {
    const key = data.keys.at(-1)
    if (!key) throw new Error("mock IdP signing identity missing")
    return key
  }
  async function generateSigningKey(): Promise<Omit<MockIdpSigningKey, "kid">> {
    const pair = await generateKeyPair(alg, { extractable: true })
    return {
      privateJwk: await exportJWK(pair.privateKey),
      publicJwk: { ...(await exportJWK(pair.publicKey)), alg, use: "sig" },
      expiresAt: clock.now() + accessTtl * 1000,
    }
  }
  if (transact((data) => data.keys.length === 0)) {
    const candidate = await generateSigningKey()
    transact((data) => {
      if (data.keys.length === 0) {
        data.keys.push({ ...candidate, kid: mint(data, "key") })
        data.identity = identity
      }
    })
  }
  transact((data) => {
    if (data.identity !== identity)
      throw new Error("mock IdP signing identity configuration mismatch")
  })

  async function signToken(
    extra: Readonly<Record<string, unknown>>,
    ttlSeconds: number,
  ): Promise<string> {
    const nowSeconds = Math.floor(clock.now() / 1000)
    const { key, jti } = transact((data) => {
      const current = currentKey(data)
      const key = { ...current, expiresAt: clock.now() + accessTtl * 1000 }
      data.keys[data.keys.length - 1] = key
      return { key, jti: mint(data, "jti") }
    })
    return new SignJWT({ ...extraClaims, ...extra })
      .setProtectedHeader({ alg, kid: key.kid })
      .setJti(jti)
      .setIssuer(issuer)
      .setAudience(clientId)
      .setSubject(subject)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ttlSeconds)
      .sign(await importJWK(key.privateJwk, alg))
  }

  async function issueTokens(
    nonce: string | undefined,
    expiresAt: number,
  ): Promise<Record<string, unknown>> {
    const effectiveNonce = options.idTokenNonceOverride ?? nonce
    const idToken = await signToken(
      effectiveNonce === undefined ? {} : { nonce: effectiveNonce },
      accessTtl,
    )
    const accessToken = await signToken({ scope: "openid profile email" }, accessTtl)
    const refreshToken = transact((data) => {
      if (data.refresh.length >= 128) throw new Error("mock IdP refresh capacity exhausted")
      const token = mint(data, "refresh")
      data.refresh.push({ token, expiresAt })
      return token
    })
    return {
      token_type: "bearer",
      access_token: accessToken,
      id_token: idToken,
      refresh_token: refreshToken,
      expires_in: accessTtl,
    }
  }

  const discovery = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: [alg],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "refresh_token"],
  }

  async function handleToken(body: string): Promise<WebResponse> {
    if (
      transact((data) => {
        const failed = data.failNext
        data.failNext = false
        return failed
      })
    ) {
      return jsonResponse({ error: "temporarily_unavailable" }, 503)
    }
    const params = new URLSearchParams(body)
    const grantType = params.get("grant_type")
    if (grantType === "refresh_token") {
      const token = params.get("refresh_token") ?? ""
      const grant = transact((data) => {
        const index = data.refresh.findIndex((entry) => entry.token === token)
        if (index < 0) return undefined
        const [entry] = data.refresh.splice(index, 1)
        return entry
      })
      if (grant === undefined) {
        return jsonResponse({ error: "invalid_grant" }, 400)
      }
      return jsonResponse(await issueTokens(undefined, grant.expiresAt))
    }
    if (grantType !== "authorization_code") {
      return jsonResponse({ error: "unsupported_grant_type" }, 400)
    }
    const code = params.get("code") ?? ""
    const verifier = params.get("code_verifier") ?? ""
    const challenge = await sha256Base64Url(verifier)
    const pending = transact((data) => {
      const index = data.codes.findIndex((entry) => entry.code === code)
      const entry = data.codes[index]
      if (
        !entry ||
        challenge !== entry.codeChallenge ||
        (params.has("redirect_uri") && params.get("redirect_uri") !== entry.redirectUri) ||
        (params.has("client_id") && params.get("client_id") !== clientId)
      )
        return undefined
      data.codes.splice(index, 1)
      return entry
    })
    if (pending === undefined) {
      // An unknown or already-redeemed code is a replay; reject it exactly as a real provider
      // would.
      return jsonResponse({ error: "invalid_grant" }, 400)
    }
    return jsonResponse(await issueTokens(pending.nonce, clock.now() + 3_600_000))
  }

  const fetch: WebFetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    if (method === "GET" && url.endsWith("/.well-known/openid-configuration")) {
      return jsonResponse(discovery)
    }
    if (method === "GET" && url === discovery.jwks_uri) {
      return jsonResponse({
        keys: transact((data) => data.keys.map((key) => ({ ...key.publicJwk, kid: key.kid }))),
      })
    }
    if (method === "POST" && url === discovery.token_endpoint) {
      return handleToken(String(init?.body ?? ""))
    }
    return jsonResponse({ error: "not_found", url, method }, 404)
  }

  return {
    issuer,
    clientId,
    fetch,
    close() {
      closed = true
      if (options.state === undefined) state.close()
    },
    authorize(authorizationUrl: string): MockAuthorizeResult {
      const url = new URL(authorizationUrl)
      const challenge = url.searchParams.get("code_challenge")
      const challengeMethod = url.searchParams.get("code_challenge_method")
      const state = url.searchParams.get("state") ?? ""
      const nonce = url.searchParams.get("nonce") ?? ""
      const redirectUri = url.searchParams.get("redirect_uri") ?? ""
      if (challenge === null || challengeMethod !== "S256") {
        throw new Error("mock IdP authorize requires PKCE code_challenge with S256")
      }
      const code = transact((data) => {
        if (data.codes.length >= 128) throw new Error("mock IdP code capacity exhausted")
        const code = mint(data, "code")
        data.codes.push({
          code,
          codeChallenge: challenge,
          nonce,
          redirectUri,
          expiresAt: clock.now() + 300_000,
        })
        return code
      })
      const callback = new URL(redirectUri)
      callback.searchParams.set("code", code)
      callback.searchParams.set("state", state)
      return { code, state, callbackUrl: callback.toString() }
    },
    failNextTokenExchange(): void {
      transact((data) => {
        data.failNext = true
      })
    },
    async rotateSigningKey(): Promise<{ kid: string }> {
      const candidate = await generateSigningKey()
      return transact((data) => {
        if (data.keys.length >= 8) throw new Error("mock IdP signing key capacity exhausted")
        const kid = mint(data, "key")
        data.keys.push({ ...candidate, kid })
        return { kid }
      })
    },
  }
}
