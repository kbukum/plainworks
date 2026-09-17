import {
  type AuthHeaders,
  base64urlEncode,
  type Clock,
  combineSignals,
  createDeadline,
  raceAbort,
  type WebAbortController,
  type WebAbortSignal,
  type WebBodyInit,
  type WebFetch,
  type WebResponse,
  type WebURLSearchParams,
} from "@plainworks/std"
import * as oauth from "oauth4webapi"
import type { AuthCrypto } from "../../crypto"
import { AuthError } from "../../errors"
import { sanitizeReturnTo } from "../../redirect"
import type { TokenSet } from "../../session"
import type { SessionSigner } from "../../signer/seam"
import { createJwtVerifier, type JwtVerifier, type VerifiedClaims } from "../jwt/verify"
import type {
  AuthAdapterDeps,
  AuthenticateRequest,
  AuthSession,
  BeginLoginRequest,
  CompleteLoginRequest,
  InteractiveAuthAdapter,
  LoginRedirect,
} from "../seam"
import { OIDC_ADAPTER_KIND, type OidcAdapterConfig, validateOidcAdapterConfig } from "./config"
import { createRefreshTokenStore, type RefreshTokenStore } from "./refresh-store"
import { signTransaction, verifyTransaction } from "./transaction"

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const
const DEFAULT_ALGS = ["RS256", "ES256"] as const
const DEFAULT_TRANSACTION_TTL_SECONDS = 600
const DEFAULT_ACCESS_TTL_SECONDS = 300
const DEFAULT_TIMEOUT_MS = 10_000
const encoder = new TextEncoder()

// One `fetch` shape that every oauth4webapi request accepts: it is a supertype of each call's
// `CustomFetchOptions`, so a single injected transport backs discovery, the token endpoint, and
// refresh. Bridges oauth4webapi's `(url, options)` custom-fetch contract onto the kit's `WebFetch`
// seam.
type OAuthCustomFetch = (
  url: string,
  options: {
    readonly method: string
    readonly headers: Record<string, string>
    readonly body?: unknown
    readonly redirect: "manual"
    readonly signal?: WebAbortSignal
    readonly duplex?: "half"
  },
) => Promise<WebResponse>

interface DiscoveredProvider {
  readonly as: oauth.AuthorizationServer
  readonly verifier: JwtVerifier
}

/**
 * Resolve the runtime `fetch` lazily — never at import time — so the module has no import-time I/O.
 */
function resolveFetch(configured: WebFetch | undefined): WebFetch {
  if (configured !== undefined) {
    return configured
  }
  const candidate = (globalThis as { fetch?: WebFetch }).fetch
  if (typeof candidate !== "function") {
    throw new AuthError(
      "auth/config",
      "no global fetch is available; inject an oidc `fetch` for this runtime",
    )
  }
  return candidate
}

function bearerFrom(headers: AuthHeaders | undefined): string | undefined {
  if (headers === undefined) {
    return undefined
  }
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "authorization") {
      const match = /^Bearer (.+)$/.exec(value)
      return match?.[1]
    }
  }
  return undefined
}

function identityFrom(claims: VerifiedClaims): AuthSession["identity"] {
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new AuthError("auth/adapter", "verified token has no subject claim")
  }
  return { subject: claims.sub, claims }
}

/**
 * The OIDC Authorization Code + PKCE (S256) adapter. A thin wrapper over `oauth4webapi` (the
 * OAuth2/ OIDC protocol) and `jose` (JWKS token verification), behind the existing
 * {@link AuthAdapter} seam. Discovery and JWKS warmup run lazily on first use (never at import
 * time); the login transaction is integrity-protected by the injected {@link SessionSigner}; every
 * source of randomness is the injected CSPRNG {@link AuthCrypto}. Instances are built per request,
 * so the refresh token it custodies never becomes a module-level singleton.
 */
export function oidcAdapter(
  config: OidcAdapterConfig,
  deps: AuthAdapterDeps,
): InteractiveAuthAdapter {
  const validated = validateOidcAdapterConfig(config)
  const crypto: AuthCrypto = deps.crypto
  const clock: Clock = deps.clock
  const signer: SessionSigner = validated.signer
  const fetchImpl = resolveFetch(validated.fetch)
  const scopes = validated.scopes ?? DEFAULT_SCOPES
  const scope = scopes.includes("openid") ? scopes.join(" ") : ["openid", ...scopes].join(" ")
  const algorithms = validated.idTokenSigningAlgs ?? DEFAULT_ALGS
  const transactionTtl = validated.transactionTtlSeconds ?? DEFAULT_TRANSACTION_TTL_SECONDS
  const timeoutMs = validated.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const tokenStore: RefreshTokenStore = validated.tokenStore ?? createRefreshTokenStore()
  const client: oauth.Client = { client_id: validated.clientId }
  const clientAuth = oauth.None()
  const issuerUrl = new URL(validated.issuer)
  const allowedOrigins = new Set<string>([
    issuerUrl.origin,
    ...(validated.allowedOrigins ?? []).map((o) => new URL(o).origin),
  ])

  function assertAllowedEndpointOrigin(endpointUrl: string | undefined, name: string): void {
    if (endpointUrl === undefined) {
      return
    }
    try {
      const url = new URL(endpointUrl)
      if (!allowedOrigins.has(url.origin)) {
        throw new AuthError(
          "auth/adapter",
          `provider ${name} origin "${url.origin}" is not allowed (allowed: ${[...allowedOrigins].join(", ")})`,
        )
      }
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }
      throw new AuthError(
        "auth/adapter",
        `provider ${name} is not a valid URL: ${String(endpointUrl)}`,
      )
    }
  }

  const oauthFetch: OAuthCustomFetch = (url, options) => {
    let targetOrigin: string | undefined
    try {
      targetOrigin = new URL(url).origin
    } catch {
      // relative or invalid
    }
    if (targetOrigin !== undefined && !allowedOrigins.has(targetOrigin)) {
      throw new AuthError(
        "auth/adapter",
        `outbound fetch to origin "${targetOrigin}" is not allowed (allowed: ${[...allowedOrigins].join(", ")})`,
      )
    }
    const init: {
      method: string
      headers: Record<string, string>
      body?: WebBodyInit
      signal?: WebAbortSignal
    } = { method: options.method, headers: options.headers }
    if (options.body !== undefined && options.body !== null) {
      // oauth4webapi only ever sends a form-encoded `URLSearchParams`/string body, both
      // `WebBodyInit`.
      init.body = options.body as WebBodyInit
    }
    if (options.signal !== undefined) {
      init.signal = options.signal
    }
    return fetchImpl(url, init)
  }
  const fetchOption = { [oauth.customFetch]: oauthFetch }

  let discovered: DiscoveredProvider | undefined
  let discoveryPromise: Promise<DiscoveredProvider> | undefined

  async function discover(): Promise<DiscoveredProvider> {
    const deadline = createDeadline(timeoutMs)
    try {
      const response = await oauth.discoveryRequest(issuerUrl, {
        ...fetchOption,
        signal: deadline.signal,
      })
      const as = await oauth.processDiscoveryResponse(issuerUrl, response)
      if (as.jwks_uri === undefined) {
        throw new AuthError("auth/adapter", "provider discovery document has no jwks_uri")
      }
      assertAllowedEndpointOrigin(as.jwks_uri, "jwks_uri")
      assertAllowedEndpointOrigin(as.token_endpoint, "token_endpoint")
      assertAllowedEndpointOrigin(as.authorization_endpoint, "authorization_endpoint")
      assertAllowedEndpointOrigin(as.userinfo_endpoint, "userinfo_endpoint")
      assertAllowedEndpointOrigin(as.revocation_endpoint, "revocation_endpoint")
      const jwksResponse = await fetchImpl(as.jwks_uri, { signal: deadline.signal })
      if (!jwksResponse.ok) {
        throw new AuthError("auth/adapter", `JWKS fetch failed with status ${jwksResponse.status}`)
      }
      const verifier = createJwtVerifier({
        jwksUri: as.jwks_uri,
        fetch: fetchImpl,
        issuer: as.issuer,
        audience: validated.clientId,
        algorithms,
        timeoutMs,
        cooldownDurationMs: validated.cooldownDurationMs,
      })
      return { as, verifier }
    } finally {
      deadline.dispose()
    }
  }

  function ready(signal?: WebAbortSignal): Promise<DiscoveredProvider> {
    if (discovered !== undefined) {
      return raceAbort(Promise.resolve(discovered), signal)
    }
    if (discoveryPromise === undefined) {
      discoveryPromise = discover()
        .then((res) => {
          discovered = res
          return res
        })
        .catch((error: unknown) => {
          discoveryPromise = undefined
          throw error
        })
    }
    return raceAbort(discoveryPromise, signal)
  }

  // Fallback handle for single-session environments and tests that omit explicit sessionHandle.
  let lastSessionHandle: string | undefined
  const inFlightRefreshes = new Map<string, Promise<TokenSet>>()
  const refreshGenerations = new Map<string, number>()
  const refreshControllers = new Map<string, WebAbortController>()

  // A detected refresh-token compromise — locally (a replayed retired token) or upstream (the
  // provider's `invalid_grant`). Purge local custody and signal out-of-band revocation so the
  // session cookie is rejected too, then always surface a security-class `auth/session-revoked`
  // deny. Both revocation attempts are made even if one throws; a failing attempt only rides along
  // as the cause, it never downgrades the deny or skips the other attempt.
  async function signalReuse(handle: string, message: string): Promise<AuthError> {
    const causes: unknown[] = []
    try {
      await tokenStore.revoke(handle)
    } catch (cause) {
      causes.push(cause)
    }
    try {
      await validated.onReuseDetected?.(handle)
    } catch (cause) {
      causes.push(cause)
    }
    const cause =
      causes.length === 0 ? undefined : causes.length === 1 ? causes[0] : new AggregateError(causes)
    return new AuthError("auth/session-revoked", message, {
      ...(cause !== undefined ? { cause } : {}),
    })
  }

  return {
    id: OIDC_ADAPTER_KIND,

    async init(): Promise<void> {
      await ready()
    },

    async beginLogin(request: BeginLoginRequest = {}): Promise<LoginRedirect> {
      const { as } = await ready(request.signal)
      if (as.authorization_endpoint === undefined) {
        throw new AuthError("auth/adapter", "provider has no authorization_endpoint")
      }
      const codeVerifier = base64urlEncode(crypto.randomBytes(32))
      const codeChallenge = base64urlEncode(await crypto.digestSha256(encoder.encode(codeVerifier)))
      const state = base64urlEncode(crypto.randomBytes(32))
      const nonce = base64urlEncode(crypto.randomBytes(32))
      const returnTo = sanitizeReturnTo(request.returnTo)

      const url = new URL(as.authorization_endpoint)
      url.searchParams.set("client_id", validated.clientId)
      url.searchParams.set("redirect_uri", validated.redirectUri)
      url.searchParams.set("response_type", "code")
      url.searchParams.set("scope", scope)
      url.searchParams.set("code_challenge", codeChallenge)
      url.searchParams.set("code_challenge_method", "S256")
      url.searchParams.set("state", state)
      url.searchParams.set("nonce", nonce)

      const transaction = await signTransaction(signer, {
        codeVerifier,
        state,
        nonce,
        returnTo,
        iat: Math.floor(clock.now() / 1000),
      })
      return { authorizationUrl: url.toString(), transaction }
    },

    async completeLogin(request: CompleteLoginRequest): Promise<AuthSession> {
      const { as, verifier } = await ready(request.signal)
      const tx = await verifyTransaction(signer, clock, transactionTtl, request.transaction)

      const callbackParams = new URLSearchParams({ ...request.params })
      let validatedParams: WebURLSearchParams
      try {
        validatedParams = oauth.validateAuthResponse(as, client, callbackParams, tx.state)
      } catch (cause) {
        throw new AuthError("auth/adapter", "authorization response failed validation", { cause })
      }

      const deadline = createDeadline(timeoutMs)
      const combinedSignal = combineSignals(request.signal, deadline.signal)
      let tokenResponse: WebResponse
      try {
        tokenResponse = await oauth.authorizationCodeGrantRequest(
          as,
          client,
          clientAuth,
          validatedParams,
          validated.redirectUri,
          tx.codeVerifier,
          { ...fetchOption, signal: combinedSignal },
        )
      } finally {
        deadline.dispose()
      }
      let result: oauth.TokenEndpointResponse
      try {
        result = await oauth.processAuthorizationCodeResponse(as, client, tokenResponse, {
          expectedNonce: tx.nonce,
          requireIdToken: true,
        })
      } catch (cause) {
        throw new AuthError("auth/adapter", "token exchange failed", { cause })
      }
      if (result.id_token === undefined) {
        throw new AuthError("auth/adapter", "token response carried no ID token")
      }
      // jose is the authoritative ID-token verifier: pinned algorithms (never `none`),
      // iss/aud/exp, and the transaction nonce — independent of oauth4webapi's parse validation.
      const claims = await verifier.verifyIdToken(result.id_token, tx.nonce)
      const identity = identityFrom(claims)
      const sessionHandle = request.sessionHandle ?? base64urlEncode(crypto.randomBytes(32))
      if (result.refresh_token !== undefined) {
        await tokenStore.issue(sessionHandle, result.refresh_token)
        lastSessionHandle = sessionHandle
      }
      return {
        identity,
        tokens: {
          accessToken: result.access_token,
          expiresAt: expiryFrom(result.expires_in),
          identity,
        },
        sessionHandle,
      }
    },

    async authenticate(request: AuthenticateRequest): Promise<AuthSession["identity"] | null> {
      const bearer = bearerFrom(request.headers)
      if (bearer === undefined) {
        return null
      }
      const { verifier } = await ready(request.signal)
      try {
        const claims = await verifier.verifyAccessToken(bearer, request.signal)
        return identityFrom(claims)
      } catch (error) {
        // A bad credential is unauthenticated; an infrastructure fault (JWKS outage) is a typed
        // error the caller surfaces, never a silent deny.
        if (error instanceof AuthError && error.kind === "auth/token-invalid") {
          return null
        }
        throw error
      }
    },

    async refresh(signal?: WebAbortSignal, sessionHandle?: string): Promise<TokenSet> {
      const targetHandle = sessionHandle ?? lastSessionHandle
      if (targetHandle === undefined) {
        throw new AuthError("auth/refresh-failed", "no refresh token is held for this session")
      }
      const handle = targetHandle
      const inFlight = inFlightRefreshes.get(handle)
      if (inFlight !== undefined) {
        return raceAbort(inFlight, signal)
      }

      const generation = refreshGenerations.get(handle) ?? 0
      const exchangeController = new AbortController()
      refreshControllers.set(handle, exchangeController)

      async function doRefresh(): Promise<TokenSet> {
        const currentRefreshToken = await tokenStore.current(handle)
        if (currentRefreshToken === undefined) {
          throw new AuthError("auth/refresh-failed", "no refresh token is held for this session")
        }
        const { as, verifier } = await ready()
        const deadline = createDeadline(timeoutMs)
        const exchangeSignal = combineSignals(deadline.signal, exchangeController.signal)
        let result: oauth.TokenEndpointResponse
        try {
          const response = await oauth.refreshTokenGrantRequest(
            as,
            client,
            clientAuth,
            currentRefreshToken,
            {
              ...fetchOption,
              signal: exchangeSignal,
            },
          )
          result = await oauth.processRefreshTokenResponse(as, client, response)
        } catch (cause) {
          // `invalid_grant` is the provider's own reuse/revocation signal: the presented refresh
          // token was already consumed or revoked upstream — the fingerprint of a leaked, replayed
          // credential. Treat it as a compromise, not a transient failure.
          if (cause instanceof oauth.ResponseBodyError && cause.error === "invalid_grant") {
            throw await signalReuse(handle, "refresh token rejected by provider (invalid_grant)")
          }
          throw new AuthError("auth/refresh-failed", "refresh token exchange failed", { cause })
        } finally {
          deadline.dispose()
        }
        // Verify session was not invalidated/logged out during the remote exchange
        if ((refreshGenerations.get(handle) ?? 0) !== generation) {
          throw new AuthError("auth/refresh-failed", "session was invalidated during refresh")
        }
        // Refresh-token rotation with reuse detection: hand the store the token we presented and
        // the provider's replacement. A replay of an already-retired token means the credential
        // leaked — deny the refresh and signal revocation so the session cookie is rejected too.
        if (result.refresh_token !== undefined) {
          const rotation = await tokenStore.rotate(
            handle,
            currentRefreshToken,
            result.refresh_token,
          )
          if (rotation.status === "reuse-detected") {
            throw await signalReuse(handle, "refresh token reuse detected")
          }
        }
        const tokens: TokenSet = {
          accessToken: result.access_token,
          expiresAt: expiryFrom(result.expires_in),
        }
        if (result.id_token !== undefined) {
          // A refreshed ID token carries no meaningful `nonce` (that belonged to original login),
          // so verify signature/iss/aud/exp without re-asserting a nonce.
          const claims = await verifier.verifyIdToken(result.id_token)
          return { ...tokens, identity: identityFrom(claims) }
        }
        return tokens
      }

      const refreshPromise = doRefresh().finally(() => {
        inFlightRefreshes.delete(handle)
        if (refreshControllers.get(handle) === exchangeController) {
          refreshControllers.delete(handle)
        }
      })
      inFlightRefreshes.set(handle, refreshPromise)
      return raceAbort(refreshPromise, signal)
    },

    async logout(_signal?: WebAbortSignal, sessionHandle?: string): Promise<void> {
      const targetHandle = sessionHandle ?? lastSessionHandle
      if (targetHandle !== undefined) {
        refreshGenerations.set(targetHandle, (refreshGenerations.get(targetHandle) ?? 0) + 1)
        const controller = refreshControllers.get(targetHandle)
        if (controller !== undefined) {
          controller.abort()
          refreshControllers.delete(targetHandle)
        }
        inFlightRefreshes.delete(targetHandle)
        await tokenStore.revoke(targetHandle)
        if (lastSessionHandle === targetHandle) {
          lastSessionHandle = undefined
        }
      }
    },
  }

  function expiryFrom(expiresIn: number | undefined): number {
    return clock.now() + (expiresIn ?? DEFAULT_ACCESS_TTL_SECONDS) * 1000
  }
}
