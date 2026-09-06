import { afterEach, describe, expect, test, vi } from "vitest"
import { idempotencyKey, randomId } from "./id"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("randomId", () => {
  test("returns the host Web Crypto UUID", () => {
    const uuid = "11111111-1111-4111-8111-111111111111"
    vi.stubGlobal("crypto", { randomUUID: () => uuid })
    expect(randomId()).toBe(uuid)
  })

  test("returns a distinct value on each call", () => {
    const uuids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
    let call = 0
    vi.stubGlobal("crypto", { randomUUID: () => uuids[call++] })
    expect(randomId()).not.toBe(randomId())
  })

  test("throws a typed error when Web Crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined)
    expect(() => randomId()).toThrowError(expect.objectContaining({ kind: "std/unsupported" }))
  })
})

describe("idempotencyKey", () => {
  test("returns a fresh Web Crypto UUID for safe write retries", () => {
    const uuids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]
    let call = 0
    vi.stubGlobal("crypto", { randomUUID: () => uuids[call++] })
    expect(idempotencyKey()).not.toBe(idempotencyKey())
  })
})
