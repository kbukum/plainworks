/**
 * The UTF-8 byte length of `value`, measured directly so a hot cookie write never allocates a
 * `TextEncoder`. Matches `new TextEncoder().encode(value).length` — including the 3-byte
 * replacement for a lone surrogate — which is what the cookie byte budget is measured against.
 */
export function utf8ByteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        // A well-formed surrogate pair encodes one 4-byte code point.
        bytes += 4
        index++
      } else {
        // A lone high surrogate encodes as the 3-byte replacement character.
        bytes += 3
      }
    } else {
      bytes += 3
    }
  }
  return bytes
}
