/**
 * The pure, host-neutral RFC 6265 cookie grammar — name/path token validation, attribute
 * serialization, and the per-cookie byte budget. It lives in `std` (the bottom layer) so both the
 * client cookie scope in `@plainworks/state` and the server-owned `__Host-` session cookie in
 * `@plainworks/auth` share **one** grammar instead of each hand-rolling it. It touches no host
 * global: name/path checks are string regexes, the byte budget is measured without allocating a
 * `TextEncoder`, and reading `document.cookie` / the host `Set-Cookie` transport stays with the caller.
 */

// A cookie name is an RFC 6265 token: visible ASCII minus controls, whitespace, and separators
// (`( ) < > @ , ; : \ " / [ ] ? = { }`). A name outside this set can break the `key=value; attrs`
// grammar or let a value smuggle attributes.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
// A path attribute: starts with `/` and carries no whitespace, `;`, or `,` that would break parsing.
const COOKIE_PATH = /^\/[^\s;,]*$/

/** The per-cookie browser budget: ~4096 bytes for the whole `key=value; attrs` entry. */
export const MAX_COOKIE_BYTES = 4096

/** `SameSite` policy controlling when a cookie rides a request. */
export type CookieSameSite = "Lax" | "Strict" | "None"

/** The attributes appended to a serialized cookie entry. */
export interface CookieAttributes {
  /** Cookie `Path`; defaults to `/`. Validate with {@link isCookiePath} before serializing. */
  readonly path?: string
  /** `SameSite` policy; defaults to `Lax`. `None` forces `Secure`. */
  readonly sameSite?: CookieSameSite
  /** `Max-Age` in seconds; omitted means a session cookie. */
  readonly maxAgeSeconds?: number
  /** Emit `Secure`. */
  readonly secure?: boolean
  /** Emit `HttpOnly` (server-set cookies the browser hides from script). */
  readonly httpOnly?: boolean
}

/** Whether `name` is a valid RFC 6265 cookie-name token. */
export function isCookieNameToken(name: string): boolean {
  return COOKIE_NAME.test(name)
}

/** Whether `path` is a valid cookie `Path` attribute value. */
export function isCookiePath(path: string): boolean {
  return COOKIE_PATH.test(path)
}

/**
 * The UTF-8 byte length of `value`, measured directly so a hot cookie write never allocates a
 * `TextEncoder`. Matches `new TextEncoder().encode(value).length` — including the 3-byte replacement
 * for a lone surrogate — which is what the cookie byte budget is measured against.
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

/**
 * Serialize the attribute suffix of a cookie entry (`Path=/; SameSite=Lax; Max-Age=…; Secure;
 * HttpOnly`) in a fixed order. Pure — it assumes an already-validated `path` (check
 * {@link isCookiePath} first) and enforces the one hard grammar rule: `SameSite=None` is only honored
 * on a `Secure` cookie, so `Secure` is forced there regardless of the `secure` flag.
 */
export function serializeCookieAttributes(attributes: CookieAttributes = {}): string {
  const path = attributes.path ?? "/"
  const sameSite = attributes.sameSite ?? "Lax"
  const parts = [`Path=${path}`, `SameSite=${sameSite}`]
  if (attributes.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${attributes.maxAgeSeconds}`)
  }
  if (attributes.secure === true || sameSite === "None") {
    parts.push("Secure")
  }
  if (attributes.httpOnly === true) {
    parts.push("HttpOnly")
  }
  return parts.join("; ")
}
