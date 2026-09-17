import { base64urlDecode, type Clock } from "@plainworks/std"
import { AuthError } from "../../errors"
import type { SessionSigner } from "../../signer/seam"
import { signPayload } from "../../signer/signed-payload"

/**
 * The per-login state that must survive the round trip to the provider and back,
 * integrity-protected so a callback cannot tamper with the PKCE binding, the CSRF `state`, or the
 * replay-guarding `nonce`. It is the opaque `transaction` a
 * {@link import("../seam").LoginRedirect} carries.
 */
export interface LoginTransaction {
  /** The PKCE code verifier whose S256 challenge was sent to the provider. */
  readonly codeVerifier: string
  /** The CSRF `state` echoed back on the callback. */
  readonly state: string
  /** The OIDC `nonce` bound into the ID token to defeat replay. */
  readonly nonce: string
  /** The sanitized, same-origin destination to return to after login. */
  readonly returnTo: string
  /** Issue time (epoch seconds) used to bound the transaction's lifetime. */
  readonly iat: number
}

const decoder = new TextDecoder()

function isTransaction(value: unknown): value is LoginTransaction {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const tx = value as Record<string, unknown>
  return (
    typeof tx.codeVerifier === "string" &&
    typeof tx.state === "string" &&
    typeof tx.nonce === "string" &&
    typeof tx.returnTo === "string" &&
    typeof tx.iat === "number"
  )
}

/** Sign a login transaction into the opaque `payload.mac` string carried across the round trip. */
export async function signTransaction(
  signer: SessionSigner,
  transaction: LoginTransaction,
): Promise<string> {
  return signPayload(signer, transaction)
}

/**
 * Verify and decode a login transaction: authenticate the MAC (before parsing untrusted bytes),
 * decode, and reject one older than `ttlSeconds`. Any failure is a typed `auth/adapter`
 * {@link AuthError} — a tampered or stale transaction never yields usable login state.
 */
export async function verifyTransaction(
  signer: SessionSigner,
  clock: Clock,
  ttlSeconds: number,
  token: string,
): Promise<LoginTransaction> {
  const dot = token.indexOf(".")
  if (dot <= 0 || dot !== token.lastIndexOf(".")) {
    throw new AuthError("auth/adapter", "login transaction is not a payload.mac pair")
  }
  const payload = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  if (!(await signer.verify(payload, mac))) {
    throw new AuthError("auth/adapter", "login transaction signature did not verify")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(base64urlDecode(payload)))
  } catch (cause) {
    throw new AuthError("auth/adapter", "login transaction payload is not decodable JSON", {
      cause,
    })
  }
  if (!isTransaction(parsed)) {
    throw new AuthError("auth/adapter", "login transaction payload has an unexpected shape")
  }
  const nowSeconds = Math.floor(clock.now() / 1000)
  if (nowSeconds - parsed.iat > ttlSeconds) {
    throw new AuthError("auth/adapter", "login transaction has expired")
  }
  return parsed
}
