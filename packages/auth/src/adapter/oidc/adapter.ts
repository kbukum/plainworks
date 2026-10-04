import { base64urlEncode } from "@plainworks/std/encoding"
import { raceAbort, withTimeout } from "@plainworks/std/resilience"
import type { AuthHeaders } from "@plainworks/std/seam"
import type { Clock } from "@plainworks/std/time"
import {
  PayloadTooLargeError,
  readBoundedBytes,
  resolveFetch,
  type WebAbortController,
  type WebAbortSignal,
  type WebBodyInit,
  type WebRequestInit,
  type WebResponse,
  type WebURLSearchParams,
} from "@plainworks/std/web"
import * as oauth from "oauth4webapi"
import type { AuthCrypto } from "../../crypto"
import { AuthError } from "../../errors"
import { sanitizeReturnTo } from "../../redirect"
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
  ProviderSessionRequest,
  ProviderTokens,
} from "../seam"
import { OIDC_ADAPTER_KIND, type OidcAdapterConfig, validateOidcAdapterConfig } from "./config"
import { createRefreshTokenStore, type RefreshTokenStore } from "./refresh-store"
import { signTransaction, verifyTransaction } from "./transaction"

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const
const DEFAULT_ALGS = ["RS256", "ES256"] as const
const DEFAULT_TRANSACTION_TTL_SECONDS = 600
const DEFAULT_ACCESS_TTL_SECONDS = 300
const DEFAULT_TIMEOUT_MS = 10_000
// Discovery, JWKS and token responses are small JSON documents. A larger body is hostile.
const MAX_PROVIDER_BODY_BYTES = 64 * 1024
const MAX_IN_FLIGHT_REFRESHES = 256
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304])
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
  // Resolved lazily, inside the factory, so importing the module does no I/O.
  const fetchImpl = resolveFetch(
    validated.fetch,
    () =>
      new AuthError(
        "auth/config",
        "no global fetch is available; inject an oidc `fetch` for this runtime",
      ),
  )
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

  // Every provider response is buffered under one byte cap before a parser sees it, so neither
  // oauth4webapi nor jose reads an unbounded body.
  async function providerFetch(url: string, init: WebRequestInit): Promise<WebResponse> {
    const response = await fetchImpl(url, { ...init, redirect: "manual" })
    let body: Uint8Array<ArrayBuffer>
    try {
      body = await readBoundedBytes(response.body, {
        maxBytes: MAX_PROVIDER_BODY_BYTES,
        ...(init.signal === undefined || init.signal === null ? {} : { signal: init.signal }),
      })
    } catch (cause) {
      if (cause instanceof PayloadTooLargeError) {
        throw new AuthError("auth/adapter", "provider response body is too large", { cause })
      }
      throw cause
    }
    return new Response(NULL_BODY_STATUSES.has(response.status) ? null : body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }

  const oauthFetch: OAuthCustomFetch = (url, options) => {
    let targetOrigin: string | undefined
    try {
      targetOrigin = new URL(url).origin
    } catch {
      // relative or invalid
    }
    if (targetOrigin !== undefined && !allowedOrigins.has(targetOrigin)) {
      return Promise.reject(
        new AuthError(
          "auth/adapter",
          `outbound fetch to origin "${targetOrigin}" is not allowed (allowed: ${[...allowedOrigins].join(", ")})`,
        ),
      )
    }
    const init: WebRequestInit = { method: options.method, headers: options.headers }
    if (options.body !== undefined && options.body !== null) {
      // oauth4webapi only ever sends a form-encoded `URLSearchParams`/string body, both
      // `WebBodyInit`.
      init.body = options.body as WebBodyInit
    }
    if (options.signal !== undefined) {
      init.signal = options.signal
    }
    return providerFetch(url, init)
  }
  const fetchOption = { [oauth.customFetch]: oauthFetch }

  let discovered: DiscoveredProvider | undefined
  let discoveryPromise: Promise<DiscoveredProvider> | undefined

  async function discover(): Promise<DiscoveredProvider> {
    return withTimeout(async (signal) => {
      const response = await oauth.discoveryRequest(issuerUrl, {
        ...fetchOption,
        signal,
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
      const jwksResponse = await providerFetch(as.jwks_uri, { signal })
      if (!jwksResponse.ok) {
        throw new AuthError("auth/adapter", `JWKS fetch failed with status ${jwksResponse.status}`)
      }
      const verifier = createJwtVerifier({
        jwksUri: as.jwks_uri,
        fetch: (url, init) => providerFetch(String(url), init ?? {}),
        issuer: as.issuer,
        audience: validated.clientId,
        algorithms,
        timeoutMs,
        cooldownDurationMs: validated.cooldownDurationMs,
      })
      return { as, verifier }
    }, timeoutMs)
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

  const inFlightRefreshes = new Map<string, Promise<ProviderTokens>>()
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
      return withTimeout(
        async (signal) => {
          const { as } = await ready(signal)
          if (as.authorization_endpoint === undefined) {
            throw new AuthError("auth/adapter", "provider has no authorization_endpoint")
          }
          const codeVerifier = base64urlEncode(crypto.randomBytes(32))
          const codeChallenge = base64urlEncode(
            await crypto.digestSha256(encoder.encode(codeVerifier)),
          )
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
          signal.throwIfAborted()
          return { authorizationUrl: url.toString(), transaction }
        },
        timeoutMs,
        { ...(request.signal === undefined ? {} : { signal: request.signal }) },
      )
    },

    async completeLogin(request: CompleteLoginRequest): Promise<AuthSession> {
      const sessionHandle = base64urlEncode(crypto.randomBytes(32))
      try {
        return await withTimeout(
          async (signal) => {
            const { as, verifier } = await ready(signal)
            const tx = await verifyTransaction(signer, clock, transactionTtl, request.transaction)

            const callbackParams = new URLSearchParams({ ...request.params })
            let validatedParams: WebURLSearchParams
            try {
              validatedParams = oauth.validateAuthResponse(as, client, callbackParams, tx.state)
            } catch (cause) {
              throw new AuthError("auth/adapter", "authorization response failed validation", {
                cause,
              })
            }

            const tokenResponse = await oauth.authorizationCodeGrantRequest(
              as,
              client,
              clientAuth,
              validatedParams,
              validated.redirectUri,
              tx.codeVerifier,
              { ...fetchOption, signal },
            )
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
            // iss/aud/exp, and the transaction nonce — independent of oauth4webapi's parse
            // validation.
            const claims = await verifier.verifyIdToken(result.id_token, tx.nonce, signal)
            const identity = identityFrom(claims)
            signal.throwIfAborted()
            if (result.refresh_token !== undefined) {
              await tokenStore.issue(sessionHandle, result.refresh_token, signal)
              if ((await tokenStore.current(sessionHandle, signal)) !== result.refresh_token) {
                throw new AuthError(
                  "auth/session-revoked",
                  "provider custody was revoked during login",
                )
              }
            }
            signal.throwIfAborted()
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
          timeoutMs,
          { ...(request.signal === undefined ? {} : { signal: request.signal }) },
        )
      } catch (cause) {
        try {
          await withTimeout(async (signal) => tokenStore.revoke(sessionHandle, signal), 2000)
        } catch (cleanupCause) {
          throw new AuthError("auth/store-unavailable", "provider login and cleanup failed", {
            cause: new AggregateError([cause, cleanupCause]),
          })
        }
        throw cause
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

    async refresh({
      sessionHandle: handle,
      signal,
    }: ProviderSessionRequest): Promise<ProviderTokens> {
      const inFlight = inFlightRefreshes.get(handle)
      if (inFlight !== undefined) {
        return raceAbort(inFlight, signal)
      }

      if (inFlightRefreshes.size >= MAX_IN_FLIGHT_REFRESHES) {
        throw new AuthError("auth/store-unavailable", "provider operation capacity exhausted")
      }
      const exchangeController = new AbortController()
      refreshControllers.set(handle, exchangeController)

      async function doRefresh(exchangeSignal: WebAbortSignal): Promise<ProviderTokens> {
        const currentRefreshToken = await tokenStore.current(handle, exchangeSignal)
        if (currentRefreshToken === undefined) {
          throw new AuthError("auth/refresh-failed", "no refresh token is held for this session")
        }
        const { as, verifier } = await ready(exchangeSignal)
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
        }
        exchangeSignal.throwIfAborted()
        // Refresh-token rotation with reuse detection: hand the store the token we presented and
        // the provider's replacement. A replay of an already-retired token means the credential
        // leaked — deny the refresh and signal revocation so the session cookie is rejected too.
        const nextRefreshToken = result.refresh_token ?? currentRefreshToken
        {
          const rotation = await tokenStore.rotate(
            handle,
            currentRefreshToken,
            nextRefreshToken,
            exchangeSignal,
          )
          if (rotation.status === "reuse-detected") {
            throw await signalReuse(handle, "refresh token reuse detected")
          }
        }
        let tokens: ProviderTokens = {
          accessToken: result.access_token,
          expiresAt: expiryFrom(result.expires_in),
        }
        if (result.id_token !== undefined) {
          // A refreshed ID token carries no meaningful `nonce` (that belonged to original login),
          // so verify signature/iss/aud/exp without re-asserting a nonce.
          const claims = await verifier.verifyIdToken(result.id_token, undefined, exchangeSignal)
          tokens = { ...tokens, identity: identityFrom(claims) }
        }
        if ((await tokenStore.current(handle, exchangeSignal)) !== nextRefreshToken) {
          throw new AuthError("auth/session-revoked", "provider custody changed during refresh")
        }
        exchangeSignal.throwIfAborted()
        return tokens
      }

      const refreshPromise = withTimeout(doRefresh, timeoutMs, {
        signal: exchangeController.signal,
      }).finally(() => {
        inFlightRefreshes.delete(handle)
        if (refreshControllers.get(handle) === exchangeController) {
          refreshControllers.delete(handle)
        }
      })
      inFlightRefreshes.set(handle, refreshPromise)
      return raceAbort(refreshPromise, signal)
    },

    async logout({ sessionHandle: handle, signal }: ProviderSessionRequest): Promise<void> {
      refreshControllers.get(handle)?.abort()
      refreshControllers.delete(handle)
      inFlightRefreshes.delete(handle)
      await withTimeout(
        async (operationSignal) => tokenStore.revoke(handle, operationSignal),
        timeoutMs,
        { ...(signal === undefined ? {} : { signal }) },
      )
    },
  }

  function expiryFrom(expiresIn: number | undefined): number {
    return clock.now() + (expiresIn ?? DEFAULT_ACCESS_TTL_SECONDS) * 1000
  }
}
