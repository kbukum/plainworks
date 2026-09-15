import { base64urlEncode } from "@plainworks/std"
import { importJWK, type JWK, jwtVerify } from "jose"
import { describe, expect, it } from "vitest"
import { createMockIdp, type MockIdpOptions } from "./oidc"

// A stable millisecond clock so token `iat`/`exp` and minted identifiers are deterministic.
const FIXED_NOW = 1_700_000_000_000
const clock = () => FIXED_NOW

async function challengeFor(verifier: string): Promise<string> {
  const subtle = (
    globalThis as unknown as {
      crypto: { subtle: { digest(a: "SHA-256", d: Uint8Array): Promise<ArrayBuffer> } }
    }
  ).crypto.subtle
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  return base64urlEncode(new Uint8Array(digest))
}

// Drive the authorization leg the way a real user-agent would: build the adapter's authorization
// URL (PKCE S256 + nonce + state) and hand it to the provider.
async function authorizationUrl(
  idp: { issuer: string; clientId: string },
  overrides: { verifier?: string; nonce?: string; state?: string; method?: string } = {},
): Promise<{ url: string; verifier: string; nonce: string; state: string }> {
  const verifier = overrides.verifier ?? "pkce-verifier-value"
  const nonce = overrides.nonce ?? "nonce-abc"
  const state = overrides.state ?? "state-xyz"
  const url = new URL(`${idp.issuer}/authorize`)
  url.searchParams.set("client_id", idp.clientId)
  url.searchParams.set("redirect_uri", "https://app.test/auth/callback")
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "openid profile email")
  url.searchParams.set("state", state)
  url.searchParams.set("nonce", nonce)
  url.searchParams.set("code_challenge", await challengeFor(verifier))
  url.searchParams.set("code_challenge_method", overrides.method ?? "S256")
  return { url: url.toString(), verifier, nonce, state }
}

function tokenRequest(params: Record<string, string>) {
  return { method: "POST", body: new URLSearchParams(params).toString() }
}

async function build(options: MockIdpOptions = {}) {
  return createMockIdp({ now: clock, ...options })
}

async function readJson(response: { json(): Promise<unknown> }): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe("createMockIdp", () => {
  it("advertises discovery metadata the adapter needs", async () => {
    const idp = await build()
    const response = await idp.fetch(`${idp.issuer}/.well-known/openid-configuration`)
    const body = await readJson(response)
    expect(body.issuer).toBe("https://idp.test")
    expect(body.token_endpoint).toBe("https://idp.test/token")
    expect(body.code_challenge_methods_supported).toEqual(["S256"])
    expect(body.grant_types_supported).toContain("refresh_token")
  })

  it("serves a JWKS that verifies its own minted tokens", async () => {
    const idp = await build({ claims: { email: "user@idp.test" } })
    const { url, verifier, nonce } = await authorizationUrl(idp)
    const { code } = idp.authorize(url)
    const tokenResponse = await idp.fetch(
      `${idp.issuer}/token`,
      tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier }),
    )
    const tokens = await readJson(tokenResponse)
    expect(tokens.token_type).toBe("bearer")
    expect(tokens.expires_in).toBe(300)

    const jwks = await readJson(await idp.fetch(`${idp.issuer}/jwks`))
    const key = (jwks.keys as JWK[])[0] as JWK
    const publicKey = await importJWK(key, "RS256")
    const { payload } = await jwtVerify(tokens.id_token as string, publicKey, {
      issuer: idp.issuer,
      audience: idp.clientId,
      currentDate: new Date(FIXED_NOW),
    })
    expect(payload.sub).toBe("user-123")
    expect(payload.nonce).toBe(nonce)
    expect(payload.email).toBe("user@idp.test")
  })

  it("echoes state and returns a redirect-back callback URL", async () => {
    const idp = await build()
    const { url, state } = await authorizationUrl(idp, { state: "carry-me" })
    const result = idp.authorize(url)
    expect(result.state).toBe("carry-me")
    const callback = new URL(result.callbackUrl)
    expect(callback.origin + callback.pathname).toBe("https://app.test/auth/callback")
    expect(callback.searchParams.get("code")).toBe(result.code)
    expect(callback.searchParams.get("state")).toBe(state)
  })

  it("mints under ES256 when configured", async () => {
    const idp = await build({ alg: "ES256" })
    const { url, verifier } = await authorizationUrl(idp)
    const { code } = idp.authorize(url)
    const tokens = await readJson(
      await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier }),
      ),
    )
    const jwks = await readJson(await idp.fetch(`${idp.issuer}/jwks`))
    const publicKey = await importJWK((jwks.keys as JWK[])[0] as JWK, "ES256")
    const { payload } = await jwtVerify(tokens.id_token as string, publicKey, {
      currentDate: new Date(FIXED_NOW),
    })
    expect(payload.iss).toBe(idp.issuer)
  })

  it("exchanges and rotates refresh tokens", async () => {
    const idp = await build()
    const { url, verifier } = await authorizationUrl(idp)
    const { code } = idp.authorize(url)
    const first = await readJson(
      await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier }),
      ),
    )
    const refreshed = await readJson(
      await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "refresh_token", refresh_token: first.refresh_token as string }),
      ),
    )
    expect(refreshed.access_token).toBeDefined()
    // The consumed refresh token is single-use: replaying it is rejected.
    const replay = await idp.fetch(
      `${idp.issuer}/token`,
      tokenRequest({ grant_type: "refresh_token", refresh_token: first.refresh_token as string }),
    )
    expect(replay.status).toBe(400)
    expect((await readJson(replay)).error).toBe("invalid_grant")
  })

  it("forces a nonce mismatch when idTokenNonceOverride is set", async () => {
    const idp = await build({ idTokenNonceOverride: "attacker-nonce" })
    const { url, verifier } = await authorizationUrl(idp, { nonce: "honest-nonce" })
    const { code } = idp.authorize(url)
    const tokens = await readJson(
      await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier }),
      ),
    )
    const jwks = await readJson(await idp.fetch(`${idp.issuer}/jwks`))
    const publicKey = await importJWK((jwks.keys as JWK[])[0] as JWK, "RS256")
    const { payload } = await jwtVerify(tokens.id_token as string, publicKey, {
      currentDate: new Date(FIXED_NOW),
    })
    expect(payload.nonce).toBe("attacker-nonce")
  })

  it("fails the next token exchange once when asked", async () => {
    const idp = await build()
    const { url, verifier } = await authorizationUrl(idp)
    const { code } = idp.authorize(url)
    idp.failNextTokenExchange()
    const failed = await idp.fetch(
      `${idp.issuer}/token`,
      tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier }),
    )
    expect(failed.status).toBe(503)
    expect((await readJson(failed)).error).toBe("temporarily_unavailable")
    // The code is untouched by the forced failure, so a retry succeeds.
    const retry = await idp.fetch(
      `${idp.issuer}/token`,
      tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier }),
    )
    expect(retry.status).toBe(200)
  })

  describe("rejections", () => {
    it("rejects a replayed authorization code", async () => {
      const idp = await build()
      const { url, verifier } = await authorizationUrl(idp)
      const { code } = idp.authorize(url)
      const request = tokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
      })
      await idp.fetch(`${idp.issuer}/token`, request)
      const replay = await idp.fetch(`${idp.issuer}/token`, request)
      expect(replay.status).toBe(400)
      expect((await readJson(replay)).error).toBe("invalid_grant")
    })

    it("rejects an unknown authorization code", async () => {
      const idp = await build()
      const response = await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "authorization_code", code: "nope", code_verifier: "x" }),
      )
      expect((await readJson(response)).error).toBe("invalid_grant")
    })

    it("rejects a mismatched PKCE verifier", async () => {
      const idp = await build()
      const { url } = await authorizationUrl(idp, { verifier: "correct-verifier" })
      const { code } = idp.authorize(url)
      const response = await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "authorization_code", code, code_verifier: "wrong-verifier" }),
      )
      expect((await readJson(response)).error).toBe("invalid_grant")
    })

    it("rejects an unsupported grant type", async () => {
      const idp = await build()
      const response = await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "client_credentials" }),
      )
      expect((await readJson(response)).error).toBe("unsupported_grant_type")
    })

    it("rejects an unknown refresh token", async () => {
      const idp = await build()
      const response = await idp.fetch(
        `${idp.issuer}/token`,
        tokenRequest({ grant_type: "refresh_token", refresh_token: "ghost" }),
      )
      expect((await readJson(response)).error).toBe("invalid_grant")
    })

    it("returns 404 for an unrouted request", async () => {
      const idp = await build()
      const response = await idp.fetch(`${idp.issuer}/unknown`)
      expect(response.status).toBe(404)
    })

    it("throws when the authorization URL omits PKCE S256", async () => {
      const idp = await build()
      const { url } = await authorizationUrl(idp, { method: "plain" })
      expect(() => idp.authorize(url)).toThrow(/S256/)
    })
  })
})
