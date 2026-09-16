// The versioned envelope is pure (no host), so it is driven directly: encoding stamps the current
// version, and decoding recognizes the envelope, falls back to version 0 for a pre-versioning
// payload, and never loses the original raw string on the legacy path.

import { describe, expect, test } from "vitest"
import { decodeEnvelope, encodeEnvelope } from "./envelope"

describe("versioned envelope", () => {
  test("round-trips a payload at the stamped version", () => {
    const raw = encodeEnvelope(3, '{"theme":"dark"}')
    expect(decodeEnvelope(raw)).toEqual({ version: 3, payload: '{"theme":"dark"}' })
  })

  test("reads a pre-versioning JSON payload as version 0, preserving the original raw", () => {
    // A value persisted before versioning existed — a bare JSON object, no envelope wrapper.
    const legacy = '{"theme":"dark"}'
    expect(decodeEnvelope(legacy)).toEqual({ version: 0, payload: legacy })
  })

  test("reads a pre-versioning non-JSON payload (identity serializer) as version 0", () => {
    // `stringSerializer` stores the value verbatim, so the raw is not JSON at all.
    expect(decodeEnvelope("dark")).toEqual({ version: 0, payload: "dark" })
  })

  test("does not mistake a plain object carrying similar keys for an envelope", () => {
    // A user value that happens to have a `d` field but no numeric version marker stays legacy.
    const legacy = '{"d":"x"}'
    expect(decodeEnvelope(legacy)).toEqual({ version: 0, payload: legacy })
  })

  test("does not mistake a legacy value shaped like the old JSON envelope for an envelope", () => {
    // A pre-versioning value that JSON-serializes to the exact old `{ $v, d }` shape must still
    // read as version 0 with its raw preserved — the control-character frame cannot be forged by
    // JSON.
    const legacy = '{"$v":1,"d":"legacy-user-data"}'
    expect(decodeEnvelope(legacy)).toEqual({ version: 0, payload: legacy })
  })

  test("a framed value survives payloads that themselves contain the sentinel or old shape", () => {
    const payload = '{"$v":9,"note":"\u0001 embedded mark"}'
    expect(decodeEnvelope(encodeEnvelope(4, payload))).toEqual({ version: 4, payload })
  })

  test("a corrupt frame (non-numeric version) falls back to legacy, preserving the raw", () => {
    const corrupt = "\u0001pw:vNaN\u0001{}"
    expect(decodeEnvelope(corrupt)).toEqual({ version: 0, payload: corrupt })
  })
})
