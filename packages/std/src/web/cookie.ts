/**
 * The pure, host-neutral RFC 6265 cookie grammar — name/path token validation, attribute
 * serialization, and the per-cookie byte budget. It lives in `std` (the bottom layer) so both the
 * client cookie scope in `@plainworks/state` and the server-owned `__Host-` session cookie in
 * `@plainworks/auth` share **one** grammar instead of each hand-rolling it. It touches no host
 * global: name/path checks are string regexes, the byte budget is measured with `utf8ByteLength`,
 * and reading `document.cookie` / the host `Set-Cookie` transport stays with the caller.
 */

// A cookie name is an RFC 6265 token: visible ASCII minus controls, whitespace, and separators
// (`( ) < > @ , ; : \ " / [ ] ? = { }`). A name outside this set can break the `key=value; attrs`
// grammar or let a value smuggle attributes.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
// A path attribute: starts with `/` and carries no whitespace, `;`, or `,` that would break
// parsing.
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
 * Parse a `Cookie` request header (`name=value; name2=value2`) into a name→value map. The value is
 * returned **exactly as sent** (still percent-encoded) — decoding and interpreting it is the
 * caller's concern, since encoding is per-cookie. Malformed pairs (no `=`, empty name) are skipped,
 * and the first occurrence of a name wins, matching how a browser jar resolves duplicates. It is
 * the read half of the cookie grammar {@link serializeCookieAttributes} writes, so both the client
 * cookie scope and the theme provider share **one** parser instead of hand-rolling the split.
 */
export function parseCookieHeader(header: string): Map<string, string> {
  const jar = new Map<string, string>()
  for (const part of header.split(";")) {
    const trimmed = part.trim()
    const separator = trimmed.indexOf("=")
    if (separator < 1) {
      continue
    }
    const name = trimmed.slice(0, separator)
    if (!jar.has(name)) {
      jar.set(name, trimmed.slice(separator + 1))
    }
  }
  return jar
}

/**
 * Read one cookie's raw value from a `Cookie` header (or a `document.cookie` string), or
 * `undefined` when it is absent. Same rules as {@link parseCookieHeader}: the value is returned
 * still percent-encoded, and the first occurrence of a name wins.
 */
export function readCookie(header: string, name: string): string | undefined {
  return parseCookieHeader(header).get(name)
}

/**
 * Serialize the attribute suffix of a cookie entry (`Path=/; SameSite=Lax; Max-Age=…; Secure;
 * HttpOnly`) in a fixed order. Pure — it assumes an already-validated `path` (check
 * {@link isCookiePath} first) and enforces the one hard grammar rule: `SameSite=None` is only
 * honored on a `Secure` cookie, so `Secure` is forced there regardless of the `secure` flag.
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
