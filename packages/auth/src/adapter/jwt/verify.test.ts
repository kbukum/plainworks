import type { WebFetch, WebResponse } from "@plainworks/std"
import { fakeFetch } from "@plainworks/testkit"
import { exportJWK, generateKeyPair, type JWK, SignJWT, UnsecuredJWT } from "jose"
import { describe, expect, test } from "vitest"
import { AuthError } from "../../errors"
import { createJwtVerifier } from "./verify"

const ISSUER = "https://idp.test"
const AUDIENCE = "api://tasks"

interface Signer {
  readonly jwk: JWK
  sign(
    claims: Record<string, unknown>,
    options?: { kid?: string; audience?: string },
  ): Promise<string>
}

async function newSigner(alg = "RS256", kid = "k1"): Promise<Signer> {
  const { publicKey, privateKey } = await generateKeyPair(alg, { extractable: true })
  const jwk: JWK = { ...(await exportJWK(publicKey)), alg, use: "sig", kid }
  return {
    jwk,
    sign: (claims, options = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg, kid: options.kid ?? kid })
        .setIssuer(ISSUER)
        .setAudience(options.audience ?? AUDIENCE)
        .setSubject((claims.sub as string) ?? "user-1")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey),
  }
}

function jwksResponse(keys: readonly JWK[]): WebResponse {
  return new Response(JSON.stringify({ keys }), {
    headers: { "content-type": "application/json" },
  }) as unknown as WebResponse
}

describe("createJwtVerifier (local jwks)", () => {
  test("verifies a well-formed token and returns its claims", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ sub: "user-42", role: "admin" })
    const verifier = createJwtVerifier({
      jwks: { keys: [signer.jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    })
    const claims = await verifier.verifyAccessToken(token)
    expect(claims.sub).toBe("user-42")
    expect(claims.role).toBe("admin")
  })

  test("rejects an alg:none (unsigned) token with a typed error", async () => {
    const signer = await newSigner()
    const unsigned = new UnsecuredJWT({ sub: "user-1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .encode()
    const verifier = createJwtVerifier({
      jwks: { keys: [signer.jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    })
    await expect(verifier.verifyAccessToken(unsigned)).rejects.toMatchObject({
      kind: "auth/token-invalid",
    })
  })

  test("rejects a token signed with a disallowed algorithm", async () => {
    const signer = await newSigner("ES256")
    const token = await signer.sign({ sub: "user-1" })
    const verifier = createJwtVerifier({
      jwks: { keys: [signer.jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    })
    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(AuthError)
  })

  test("rejects a malformed token with a typed error that preserves the cause", async () => {
    const signer = await newSigner()
    const verifier = createJwtVerifier({
      jwks: { keys: [signer.jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    })
    const error = await verifier.verifyAccessToken("not-a-jwt").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AuthError)
    expect((error as AuthError).cause).toBeDefined()
  })

  test("rejects a token minted for a different audience", async () => {
    const signer = await newSigner()
    // Sign with the trusted key but the wrong audience, so rejection is caused by the `aud` check
    // rather than an incidental signature mismatch.
    const token = await signer.sign({ sub: "user-1" }, { audience: "api://other" })
    const verifier = createJwtVerifier({
      jwks: { keys: [signer.jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    })
    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(AuthError)
  })

  test("rejects a token that carries no exp claim (a non-expiring token)", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true })
    const jwk: JWK = { ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "k1" }
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setSubject("user-1")
      .setIssuedAt()
      .sign(privateKey)
    const verifier = createJwtVerifier({
      jwks: { keys: [jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    })
    await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(AuthError)
  })

  test("throws a config error when neither a remote jwksUri+fetch nor a local jwks is given", () => {
    expect(() =>
      createJwtVerifier({ issuer: ISSUER, audience: AUDIENCE, algorithms: ["RS256"] }),
    ).toThrowError(AuthError)
  })
})

describe("createJwtVerifier (remote jwks)", () => {
  test("fetches the JWKS through the injected fetch seam and verifies", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ sub: "user-7" })
    const fetch = fakeFetch([jwksResponse([signer.jwk])])
    const verifier = createJwtVerifier({
      jwksUri: `${ISSUER}/jwks`,
      fetch: fetch.fetch,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
      cooldownDurationMs: 0,
    })
    const claims = await verifier.verifyAccessToken(token)
    expect(claims.sub).toBe("user-7")
    expect(fetch.calls[0]?.url).toBe(`${ISSUER}/jwks`)
  })

  test("refetches the JWKS when a token presents a newly-rotated key id", async () => {
    const first = await newSigner("RS256", "k1")
    const second = await newSigner("RS256", "k2")
    const rotatedToken = await second.sign({ sub: "user-9" })
    // First fetch serves only k1; the second serves both, so the unknown-kid path refetches.
    const fetch = fakeFetch([jwksResponse([first.jwk]), jwksResponse([first.jwk, second.jwk])])
    const verifier = createJwtVerifier({
      jwksUri: `${ISSUER}/jwks`,
      fetch: fetch.fetch,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
      cooldownDurationMs: 0,
    })
    const claims = await verifier.verifyAccessToken(rotatedToken)
    expect(claims.sub).toBe("user-9")
    expect(fetch.calls.length).toBeGreaterThanOrEqual(2)
  })

  test("bounds a hanging JWKS fetch by the configured timeout", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ sub: "user-1" })
    // A fetch that only settles when its abort signal fires, so the verifier's timeout is what ends
    // it — proving the JWKS retrieval is deadline-bounded and cancellable.
    const hangingFetch: WebFetch = (_url, init) =>
      new Promise<WebResponse>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      })
    const verifier = createJwtVerifier({
      jwksUri: `${ISSUER}/jwks`,
      fetch: hangingFetch,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
      timeoutMs: 20,
      cooldownDurationMs: 0,
    })
    await expect(verifier.verifyAccessToken(token)).rejects.toMatchObject({ kind: "auth/adapter" })
  })

  test("classifies a bad credential as auth/token-invalid, distinct from an outage", async () => {
    const signer = await newSigner()
    const other = await newSigner()
    const forged = await other.sign({ sub: "user-1" })
    const verifier = createJwtVerifier({
      jwks: { keys: [signer.jwk] },
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["RS256"],
    })
    await expect(verifier.verifyAccessToken(forged)).rejects.toMatchObject({
      kind: "auth/token-invalid",
    })
  })
})
