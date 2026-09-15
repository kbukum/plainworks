import { base64urlEncode, type WebFetch, type WebResponse } from "@plainworks/std"
import { exportJWK, generateKeyPair, SignJWT } from "jose"

/**
 * A signing algorithm the {@link MockIdp} mints tokens under. Both are asymmetric (a
 * JWKS-verifiable public key), so a consumer verifies the token exactly as it would a real
 * provider's — `none` is never an option.
 */
export type MockIdpAlg = "RS256" | "ES256"

/** How to build a {@link MockIdp}. Every field has a deterministic default so a test can omit it. */
export interface MockIdpOptions {
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
  /** Injected millisecond clock for token `iat`/`exp`; defaults to `Date.now`. */
  readonly now?: () => number
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

interface PendingCode {
  readonly codeChallenge: string
  readonly nonce: string
  readonly redirectUri: string
  used: boolean
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
  const now = options.now ?? Date.now
  const extraClaims = options.claims ?? {}

  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true })
  let currentKid = "mock-idp-key"
  let currentPrivateKey = privateKey
  const publicJwks = [{ ...(await exportJWK(publicKey)), alg, use: "sig", kid: currentKid }]

  const codes = new Map<string, PendingCode>()
  const refreshTokens = new Set<string>()
  let failNext = false
  let counter = 0
  const mint = (prefix: string): string => {
    counter += 1
    return `${prefix}-${counter}-${now()}`
  }

  async function signToken(
    extra: Readonly<Record<string, unknown>>,
    ttlSeconds: number,
  ): Promise<string> {
    const nowSeconds = Math.floor(now() / 1000)
    return new SignJWT({ ...extraClaims, ...extra })
      .setProtectedHeader({ alg, kid: currentKid })
      .setJti(mint("jti"))
      .setIssuer(issuer)
      .setAudience(clientId)
      .setSubject(subject)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ttlSeconds)
      .sign(currentPrivateKey)
  }

  async function issueTokens(nonce: string | undefined): Promise<Record<string, unknown>> {
    const effectiveNonce = options.idTokenNonceOverride ?? nonce
    const idToken = await signToken(
      effectiveNonce === undefined ? {} : { nonce: effectiveNonce },
      accessTtl,
    )
    const accessToken = await signToken({ scope: "openid profile email" }, accessTtl)
    const refreshToken = mint("refresh")
    refreshTokens.add(refreshToken)
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
    if (failNext) {
      failNext = false
      return jsonResponse({ error: "temporarily_unavailable" }, 503)
    }
    const params = new URLSearchParams(body)
    const grantType = params.get("grant_type")
    if (grantType === "refresh_token") {
      const token = params.get("refresh_token") ?? ""
      if (!refreshTokens.has(token)) {
        return jsonResponse({ error: "invalid_grant" }, 400)
      }
      refreshTokens.delete(token)
      return jsonResponse(await issueTokens(undefined))
    }
    if (grantType !== "authorization_code") {
      return jsonResponse({ error: "unsupported_grant_type" }, 400)
    }
    const code = params.get("code") ?? ""
    const pending = codes.get(code)
    if (pending === undefined || pending.used) {
      // An unknown or already-redeemed code is a replay; reject it exactly as a real provider
      // would.
      return jsonResponse({ error: "invalid_grant" }, 400)
    }
    const verifier = params.get("code_verifier") ?? ""
    if ((await sha256Base64Url(verifier)) !== pending.codeChallenge) {
      return jsonResponse({ error: "invalid_grant" }, 400)
    }
    pending.used = true
    return jsonResponse(await issueTokens(pending.nonce))
  }

  const fetch: WebFetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString()
    const method = (init?.method ?? "GET").toUpperCase()
    if (method === "GET" && url.endsWith("/.well-known/openid-configuration")) {
      return jsonResponse(discovery)
    }
    if (method === "GET" && url === discovery.jwks_uri) {
      return jsonResponse({ keys: publicJwks })
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
      const code = mint("code")
      codes.set(code, { codeChallenge: challenge, nonce, redirectUri, used: false })
      const callback = new URL(redirectUri)
      callback.searchParams.set("code", code)
      callback.searchParams.set("state", state)
      return { code, state, callbackUrl: callback.toString() }
    },
    failNextTokenExchange(): void {
      failNext = true
    },
    async rotateSigningKey(): Promise<{ kid: string }> {
      const newKid = `mock-idp-key-${publicJwks.length + 1}`
      const newPair = await generateKeyPair(alg, { extractable: true })
      const newJwk = { ...(await exportJWK(newPair.publicKey)), alg, use: "sig", kid: newKid }
      publicJwks.push(newJwk)
      currentPrivateKey = newPair.privateKey
      currentKid = newKid
      return { kid: newKid }
    },
  }
}
