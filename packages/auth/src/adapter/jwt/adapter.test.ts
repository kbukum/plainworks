import type { AuthHeaders, WebFetch, WebResponse } from "@plainworks/std"
import { systemClock } from "@plainworks/std"
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose"
import { describe, expect, test } from "vitest"
import { defaultAuthCrypto } from "../../crypto"
import { AuthError } from "../../errors"
import type { AuthAdapterDeps } from "../adapter"
import { jwtAdapter } from "./adapter"
import { validateJwtAdapterConfig } from "./config"

const ISSUER = "https://idp.test"
const AUDIENCE = "api://tasks"
const deps: AuthAdapterDeps = { crypto: defaultAuthCrypto(), clock: systemClock }

interface Signer {
  readonly jwk: JWK
  sign(claims: Record<string, unknown>): Promise<string>
}

async function newSigner(): Promise<Signer> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true })
  const jwk: JWK = { ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "k1" }
  return {
    jwk,
    sign: (claims) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey),
  }
}

function bearer(token: string, header = "Authorization", scheme = "Bearer"): AuthHeaders {
  return { [header]: `${scheme} ${token}` }
}

describe("jwtAdapter.authenticate", () => {
  test("resolves the identity from a valid bearer token", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ sub: "user-42", role: "admin" })
    const adapter = jwtAdapter(
      { kind: "jwt", issuer: ISSUER, audience: AUDIENCE, jwks: { keys: [signer.jwk] } },
      deps,
    )
    const identity = await adapter.authenticate({ headers: bearer(token) })
    expect(identity?.subject).toBe("user-42")
    expect(identity?.claims.role).toBe("admin")
  })

  test("returns null when no credential header is present", async () => {
    const signer = await newSigner()
    const adapter = jwtAdapter(
      { kind: "jwt", issuer: ISSUER, audience: AUDIENCE, jwks: { keys: [signer.jwk] } },
      deps,
    )
    expect(await adapter.authenticate({})).toBeNull()
    expect(await adapter.authenticate({ headers: {} })).toBeNull()
  })

  test("returns null for a non-bearer authorization scheme", async () => {
    const signer = await newSigner()
    const adapter = jwtAdapter(
      { kind: "jwt", issuer: ISSUER, audience: AUDIENCE, jwks: { keys: [signer.jwk] } },
      deps,
    )
    expect(await adapter.authenticate({ headers: { Authorization: "Basic abc123" } })).toBeNull()
  })

  test("treats an invalid or forged token as unauthenticated (null), never throwing", async () => {
    const signer = await newSigner()
    const other = await newSigner()
    const forged = await other.sign({ sub: "user-1" })
    const adapter = jwtAdapter(
      { kind: "jwt", issuer: ISSUER, audience: AUDIENCE, jwks: { keys: [signer.jwk] } },
      deps,
    )
    expect(await adapter.authenticate({ headers: bearer("garbage") })).toBeNull()
    expect(await adapter.authenticate({ headers: bearer(forged) })).toBeNull()
  })

  test("returns null when the verified token carries no subject claim", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ role: "admin" })
    const adapter = jwtAdapter(
      { kind: "jwt", issuer: ISSUER, audience: AUDIENCE, jwks: { keys: [signer.jwk] } },
      deps,
    )
    // A default `sub` is still stamped by `setSubject`? No — omitted here, so no subject.
    const identity = await adapter.authenticate({ headers: bearer(token) })
    expect(identity).toBeNull()
  })

  test("honors a custom header, scheme, and subject claim", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ uid: "svc-1" })
    const adapter = jwtAdapter(
      {
        kind: "jwt",
        issuer: ISSUER,
        audience: AUDIENCE,
        jwks: { keys: [signer.jwk] },
        headerName: "X-Access-Token",
        scheme: "Token",
        subjectClaim: "uid",
      },
      deps,
    )
    const identity = await adapter.authenticate({
      headers: bearer(token, "X-Access-Token", "Token"),
    })
    expect(identity?.subject).toBe("svc-1")
  })

  test("propagates an infrastructure fault instead of masking it as a 401", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ sub: "user-1" })
    // A JWKS fetch that never settles until aborted, so the verifier's timeout raises a typed
    // infrastructure error the adapter must surface rather than swallow into `null`.
    const hangingFetch: WebFetch = (_url, init) =>
      new Promise<WebResponse>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
      })
    const adapter = jwtAdapter(
      {
        kind: "jwt",
        issuer: ISSUER,
        audience: AUDIENCE,
        jwksUri: `${ISSUER}/jwks`,
        fetch: hangingFetch,
        timeoutMs: 20,
        cooldownDurationMs: 0,
      },
      deps,
    )
    await expect(adapter.authenticate({ headers: bearer(token) })).rejects.toMatchObject({
      kind: "auth/adapter",
    })
  })
})

describe("validateJwtAdapterConfig", () => {
  const base = { kind: "jwt", issuer: ISSUER, audience: AUDIENCE, jwks: { keys: [] } }

  test("accepts a well-formed local-jwks config", () => {
    expect(validateJwtAdapterConfig(base).kind).toBe("jwt")
  })

  test("rejects malformed configuration", () => {
    expect(() => validateJwtAdapterConfig(null)).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, kind: "nope" })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, issuer: "" })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, issuer: "not-a-url" })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, audience: "" })).toThrowError(AuthError)
    expect(() =>
      validateJwtAdapterConfig({ kind: "jwt", issuer: ISSUER, audience: AUDIENCE }),
    ).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, algorithms: ["RS256", "none"] })).toThrowError(
      AuthError,
    )
    expect(() => validateJwtAdapterConfig({ ...base, algorithms: [] })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, timeoutMs: -1 })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, timeoutMs: 1.5 })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, cooldownDurationMs: 1.5 })).toThrowError(
      AuthError,
    )
    expect(() => validateJwtAdapterConfig({ ...base, fetch: "bad" })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, jwks: "nope" })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, jwks: { keys: "nope" } })).toThrowError(
      AuthError,
    )
    expect(() => validateJwtAdapterConfig({ ...base, headerName: 1 })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, headerName: "" })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, scheme: "  " })).toThrowError(AuthError)
    expect(() => validateJwtAdapterConfig({ ...base, subjectClaim: 42 })).toThrowError(AuthError)
  })

  test("tolerates a regex-metacharacter scheme without throwing at request time", async () => {
    const signer = await newSigner()
    const token = await signer.sign({ sub: "user-1" })
    const adapter = jwtAdapter(
      {
        kind: "jwt",
        issuer: ISSUER,
        audience: AUDIENCE,
        jwks: { keys: [signer.jwk] },
        scheme: "(",
      },
      deps,
    )
    // The scheme is escaped before it becomes a RegExp, so a literal "(" prefix matches instead of
    // raising a SyntaxError.
    const identity = await adapter.authenticate({ headers: { Authorization: `( ${token}` } })
    expect(identity?.subject).toBe("user-1")
  })
})
