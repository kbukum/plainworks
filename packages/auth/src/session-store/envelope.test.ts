import { base64urlEncode, createSeededRandom, type StandardSchemaV1 } from "@plainworks/std"
import { type ManualClock, manualClock } from "@plainworks/testkit"
import { describe, expect, test } from "vitest"
import { AuthError } from "../errors"
import type { SessionSigner } from "../signer/seam"
import { decodeSession, encodeSession, type SessionCodec } from "./envelope"

const encoder = new TextEncoder()

// A deterministic MAC seam: `sign(m)` is `sig-${m}`, so any mutation of the payload invalidates the
// tag without a real key. `verify` is the exact inverse, matching the constant-time HMAC contract.
const fakeSigner: SessionSigner = {
  sign: async (message) => `sig-${message}`,
  verify: async (message, signature) => signature === `sig-${message}`,
}

// A tiny Standard Schema over the session value: accepts `{ sub: string }`, rejects anything else.
const sessionSchema: StandardSchemaV1<unknown, { sub: string }> = {
  "~standard": {
    version: 1,
    vendor: "auth-test",
    validate: (value) =>
      typeof value === "object" &&
      value !== null &&
      "sub" in value &&
      typeof (value as { sub?: unknown }).sub === "string"
        ? { value: value as { sub: string } }
        : { issues: [{ message: "expected { sub: string }" }] },
  },
}

const TTL_SECONDS = 3600

function makeCodec(startMs = 0): { codec: SessionCodec<typeof sessionSchema>; clock: ManualClock } {
  const clock = manualClock(startMs)
  return {
    clock,
    codec: {
      signer: fakeSigner,
      schema: sessionSchema,
      clock,
      ttlSeconds: TTL_SECONDS,
    },
  }
}

// Hand-mint an authentic cookie over an arbitrary JSON string so the MAC always verifies, letting a
// test drive the *post-verification* branches (bad JSON, non-envelope, schema failure) directly.
async function signedCookie(json: string): Promise<string> {
  const payload = base64urlEncode(encoder.encode(json))
  return `${payload}.${await fakeSigner.sign(payload)}`
}

async function expectAuthError(promise: Promise<unknown>, kind: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ kind })
  await expect(promise).rejects.toBeInstanceOf(AuthError)
}

describe("encodeSession / decodeSession round-trip", () => {
  test("decodes exactly what was encoded", async () => {
    const { codec } = makeCodec(1_000_000)
    const cookie = await encodeSession(codec, { sub: "user-1" })
    expect(cookie).toMatch(/^[A-Za-z0-9_-]+\.sig-[A-Za-z0-9_-]+$/)
    await expect(decodeSession(codec, cookie)).resolves.toEqual({ sub: "user-1" })
  })

  test("stamps an absolute expiry ttlSeconds ahead of now", async () => {
    const { codec, clock } = makeCodec(0)
    const cookie = await encodeSession(codec, { sub: "user-1" })
    // Still valid one second before exp, expired at exp.
    clock.set((TTL_SECONDS - 1) * 1000)
    await expect(decodeSession(codec, cookie)).resolves.toEqual({ sub: "user-1" })
  })
})

describe("decodeSession verify-at-read failures", () => {
  test("a tampered payload fails the MAC → session-invalid", async () => {
    const { codec } = makeCodec()
    const cookie = await encodeSession(codec, { sub: "user-1" })
    const [payload, mac] = cookie.split(".")
    const tampered = `${payload}x.${mac}`
    await expectAuthError(decodeSession(codec, tampered), "auth/session-invalid")
  })

  test("a tampered MAC fails verification → session-invalid", async () => {
    const { codec } = makeCodec()
    const cookie = await encodeSession(codec, { sub: "user-1" })
    const [payload] = cookie.split(".")
    await expectAuthError(decodeSession(codec, `${payload}.sig-nope`), "auth/session-invalid")
  })

  test("a value without a payload.mac shape → session-invalid", async () => {
    const { codec } = makeCodec()
    await expectAuthError(decodeSession(codec, "not-a-pair"), "auth/session-invalid")
    await expectAuthError(decodeSession(codec, ".onlymac"), "auth/session-invalid")
    await expectAuthError(decodeSession(codec, "a.b.c"), "auth/session-invalid")
  })

  test("an authentic but undecodable-JSON payload → session-invalid", async () => {
    const { codec } = makeCodec()
    const cookie = await signedCookie("not json{")
    await expectAuthError(decodeSession(codec, cookie), "auth/session-invalid")
  })

  test("an authentic payload that is not a session envelope → session-invalid", async () => {
    const { codec } = makeCodec()
    const cookie = await signedCookie(JSON.stringify({ sub: "user-1" }))
    await expectAuthError(decodeSession(codec, cookie), "auth/session-invalid")
  })

  test("an authentic, unexpired envelope whose value fails the schema → session-invalid", async () => {
    const { codec } = makeCodec()
    const cookie = await signedCookie(JSON.stringify({ v: { sub: 123 }, iat: 0, exp: TTL_SECONDS }))
    await expectAuthError(decodeSession(codec, cookie), "auth/session-invalid")
  })

  test("an authentic envelope past its absolute lifetime → session-expired", async () => {
    const { codec, clock } = makeCodec(0)
    const cookie = await encodeSession(codec, { sub: "user-1" })
    clock.set(TTL_SECONDS * 1000)
    await expectAuthError(decodeSession(codec, cookie), "auth/session-expired")
  })
})

describe("decodeSession fuzz", () => {
  test("no single-character mutation of an authentic cookie yields a session", async () => {
    const { codec } = makeCodec(1_700_000_000_000)
    const cookie = await encodeSession(codec, { sub: "user-1" })
    const rng = createSeededRandom(0xf0cc)
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_."
    for (let iteration = 0; iteration < 300; iteration++) {
      const index = Math.floor(rng.next() * cookie.length)
      const replacement = alphabet[Math.floor(rng.next() * alphabet.length)] ?? "x"
      const mutated = cookie.slice(0, index) + replacement + cookie.slice(index + 1)
      if (mutated === cookie) {
        continue
      }
      // A mutation must never resurrect a valid session — it either throws or (never) returns.
      await expect(decodeSession(codec, mutated)).rejects.toBeInstanceOf(AuthError)
    }
  })
})
