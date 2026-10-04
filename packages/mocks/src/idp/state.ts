import { isRecord } from "@plainworks/std"
import type { JWK } from "jose"

/** A fixture key; old public keys remain available until their last tokens expire. */
export interface MockIdpSigningKey {
  readonly kid: string
  readonly privateJwk: JWK
  readonly publicJwk: JWK
  readonly expiresAt: number
}

/** One-time authorization custody. */
export interface MockIdpCode {
  readonly code: string
  readonly codeChallenge: string
  readonly nonce: string
  readonly redirectUri: string
  readonly expiresAt: number
}

/** Serializable fixture state. Never use this fixture as a production identity system. */
export interface MockIdpData {
  identity: string | null
  keys: MockIdpSigningKey[]
  codes: MockIdpCode[]
  refresh: { token: string; expiresAt: number }[]
  counter: number
  failNext: boolean
}

/**
 * Explicit fixture custody. Transactions must be synchronous, atomic, rollback on failure,
 * and own their values. Callbacks must not perform asynchronous work. Every handle over the same
 * data must observe each committed transaction; `createMockIdpStateCases` checks this contract.
 */
export interface MockIdpState {
  transact<Value>(operation: (data: MockIdpData) => Value): Value
  close(): void
}

export function emptyMockIdpData(): MockIdpData {
  return {
    identity: null,
    keys: [],
    codes: [],
    refresh: [],
    counter: 0,
    failNext: false,
  }
}

function jwk(value: unknown): value is JWK {
  return (
    isRecord(value) &&
    typeof value.kty === "string" &&
    Object.values(value).every(
      (entry) =>
        typeof entry === "string" ||
        typeof entry === "boolean" ||
        (Array.isArray(entry) && entry.every((item) => typeof item === "string")),
    )
  )
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

/** Validate the persisted fixture boundary, including admission bounds. */
export function decodeMockIdpData(encoded: string): MockIdpData {
  if (encoded.length > 65_536) throw new Error("mock IdP fixture exceeds capacity")
  const data: unknown = JSON.parse(encoded)
  if (
    !isRecord(data) ||
    !(data.identity === null || typeof data.identity === "string") ||
    !finite(data.counter) ||
    typeof data.failNext !== "boolean" ||
    !Array.isArray(data.keys) ||
    data.keys.length > 8 ||
    !data.keys.every(
      (key) =>
        isRecord(key) &&
        typeof key.kid === "string" &&
        jwk(key.privateJwk) &&
        jwk(key.publicJwk) &&
        finite(key.expiresAt),
    ) ||
    !Array.isArray(data.codes) ||
    data.codes.length > 128 ||
    !data.codes.every(
      (code) =>
        isRecord(code) &&
        ["code", "codeChallenge", "nonce", "redirectUri"].every(
          (field) => typeof code[field] === "string" && code[field].length <= 2048,
        ) &&
        finite(code.expiresAt),
    ) ||
    !Array.isArray(data.refresh) ||
    data.refresh.length > 128 ||
    !data.refresh.every(
      (token) =>
        isRecord(token) &&
        typeof token.token === "string" &&
        token.token.length <= 2048 &&
        finite(token.expiresAt),
    )
  )
    throw new Error("invalid mock IdP fixture state")
  // Every property is validated above; JSON parsing is the ownership boundary.
  return data as unknown as MockIdpData
}

/** Isolated bounded memory custody; inject it to share data across provider instances. */
export function createMemoryMockIdpState(): MockIdpState {
  let encoded = JSON.stringify(emptyMockIdpData())
  let closed = false
  const transact = <Value>(operation: (data: MockIdpData) => Value): Value => {
    if (closed) throw new Error("mock IdP state is closed")
    const data = decodeMockIdpData(encoded)
    const result = operation(data)
    const next = JSON.stringify(data)
    decodeMockIdpData(next)
    encoded = next
    return result
  }
  return {
    transact,
    close() {
      closed = true
    },
  }
}
