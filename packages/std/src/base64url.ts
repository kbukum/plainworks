/**
 * `base64url` (RFC 4648 §5) encode/decode over raw bytes — the URL- and cookie-safe alphabet with
 * no padding. Hand-rolled against a lookup table because the portability shim declares neither
 * `btoa` (browser-only) nor `Buffer` (Node-only), so this stays host-neutral and lives at L0 for
 * every layer that frames bytes for a URL, cookie, header, or MAC (the signed session cookie, PKCE,
 * and more).
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

// Reverse lookup: code point -> 6-bit value, or -1 for any character outside the base64url
// alphabet.
const DECODE = (() => {
  const table = new Int8Array(128).fill(-1)
  for (let index = 0; index < ALPHABET.length; index++) {
    table[ALPHABET.charCodeAt(index)] = index
  }
  return table
})()

/** Encode raw bytes to an unpadded `base64url` string. */
export function base64urlEncode(bytes: Uint8Array): string {
  let output = ""
  for (let index = 0; index < bytes.length; index += 3) {
    const b0 = bytes[index] as number
    const b1 = index + 1 < bytes.length ? (bytes[index + 1] as number) : undefined
    const b2 = index + 2 < bytes.length ? (bytes[index + 2] as number) : undefined
    output += ALPHABET[b0 >> 2]
    output += ALPHABET[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)]
    if (b1 === undefined) {
      break
    }
    output += ALPHABET[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)]
    if (b2 === undefined) {
      break
    }
    output += ALPHABET[b2 & 0x3f]
  }
  return output
}

/**
 * Decode an unpadded `base64url` string back to bytes.
 *
 * @throws {RangeError} when `value` contains a character outside the `base64url` alphabet or has an
 * impossible length (a single trailing 6-bit group). Callers at a trust boundary catch this and map
 * it to a typed domain error rather than accepting malformed input.
 */
export function base64urlDecode(value: string): Uint8Array {
  const length = value.length
  if (length % 4 === 1) {
    throw new RangeError("Invalid base64url: dangling character group")
  }
  const byteLength = Math.floor((length * 3) / 4)
  const out = new Uint8Array(byteLength)
  let outIndex = 0
  let buffer = 0
  let bits = 0
  for (let index = 0; index < length; index++) {
    const code = value.charCodeAt(index)
    const sextet = code < 128 ? DECODE[code] : -1
    if (sextet === undefined || sextet === -1) {
      throw new RangeError("Invalid base64url: character outside the alphabet")
    }
    buffer = (buffer << 6) | sextet
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[outIndex++] = (buffer >> bits) & 0xff
    }
  }
  return out
}
