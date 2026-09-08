/**
 * Redaction for safe logging: strip credentials, tokens, and other secrets from a value before it
 * reaches an observability sink, so a request/response is never logged with a live token or payload
 * secret. Pure and structural — returns a redacted copy, never mutating the input.
 */

/** Options for {@link redact}. */
export interface RedactOptions {
  /** Extra sensitive key names (case-insensitive substring match) beyond the built-in set. */
  readonly keys?: readonly string[]
  /** Replacement placeholder for a redacted value. Defaults to `"[REDACTED]"`. */
  readonly mask?: string
  /** Maximum object/array depth to walk before truncating. Defaults to `6`. */
  readonly maxDepth?: number
}

/** Key names whose values are always redacted, regardless of surrounding shape. */
const DEFAULT_SENSITIVE_KEYS: readonly string[] = [
  "authorization",
  "cookie",
  "set-cookie",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "password",
  "passwd",
  "secret",
  "client_secret",
  "api_key",
  "apikey",
  "session",
  "sessionid",
  "credential",
  "private_key",
]

/** JWT-shaped string (`header.payload.signature`). */
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
/** `Bearer <token>` authorization value. */
const BEARER_PATTERN = /^Bearer\s+\S+/i
/**
 * An embedded `<scheme> <token>` HTTP credential (`Bearer <jwt>`, `DPoP <jwt>`, `Basic <b64>`)
 * sitting inside a larger string — a serialized `Authorization` header, an error message, a log
 * line. The whole scheme+token run is masked, because stopping at the first whitespace (as the
 * generic `key=value` matcher below does) would redact only the scheme word and leak the token
 * after it (e.g. `Authorization: [REDACTED] <jwt>`). The token runs to the next hard delimiter;
 * scheme and token are separate, non-overlapping character classes, so the global scan stays linear
 * (no super-linear backtracking) on adversarial input. Applied before the generic pair matcher.
 */
const EMBEDDED_AUTH_SCHEME_PATTERN =
  /\b(?:Bearer|DPoP|Basic|Digest|Negotiate|NTLM)\s+[^\s&;,"'?#]+/gi
/**
 * An embedded `key=value` (or `key: value`) credential inside a larger string — a query string, an
 * error message, or a log line. The captured value runs to the next delimiter (whitespace, `&`,
 * `?`, `#`, `;`, `,`, or a quote), so `access_token=live-secret` and `password: live-secret` are
 * masked while the surrounding text survives. The key-name run is length-bounded so an adversarial
 * input (a long unbroken run of key-legal characters with no separator) can't drive super-linear
 * backtracking as the global scan advances — real credential key names are far shorter than the
 * cap.
 */
const EMBEDDED_SECRET_PATTERN = /([A-Za-z][A-Za-z0-9_.-]{0,127})(\s*[=:]\s*)([^\s&;,"'?#]+)/g

function looksSecret(value: string): boolean {
  return JWT_PATTERN.test(value) || BEARER_PATTERN.test(value)
}

/**
 * Mask any embedded `<scheme> <token>` HTTP credential — the whole scheme+token run — inside a
 * larger string. This closes the gap where a serialized `Authorization: Bearer <jwt>` header would
 * otherwise have only its scheme redacted by the generic `key=value` matcher (which stops at the
 * first whitespace), leaking the token that follows. Applied before {@link maskEmbeddedSecrets}.
 */
function maskCredentialSchemes(value: string, mask: string): string {
  return value.replace(EMBEDDED_AUTH_SCHEME_PATTERN, mask)
}

/**
 * Mask the value half of any embedded `key=value` pair whose key names a secret, leaving the rest
 * of the string intact. This closes the gap where a token is smuggled inside a larger string (a URL
 * query, a thrown error message) rather than sitting as its own property value.
 */
function maskEmbeddedSecrets(
  value: string,
  mask: string,
  isSensitive: (key: string) => boolean,
): string {
  return value.replace(EMBEDDED_SECRET_PATTERN, (match, key: string, separator: string) =>
    isSensitive(key) ? `${key}${separator}${mask}` : match,
  )
}

// Keys are matched lowercase with separators removed, so `x-api-key`, `api_key`, and `apikey` all
// collapse to the same token.
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_.]/g, "")
}

/** The built-in sensitive names, normalized once so membership is a cheap substring scan. */
const NORMALIZED_SENSITIVE_KEYS: readonly string[] = DEFAULT_SENSITIVE_KEYS.map(normalizeKey)

/**
 * Whether `key` names a credential/secret value that must never be logged or smuggled into a URL.
 * The comparison is separator-insensitive **substring** matching against the built-in sensitive
 * vocabulary plus any `extraKeys`, so `X-Api-Key`, `api_key`, and `apikey` all match `apikey`, and
 * `sessionId` matches `session`. This is the one owner of the sensitive-key vocabulary —
 * {@link redact} and header-only-auth URL guards both reuse it instead of forking their own list.
 */
export function isSensitiveKey(key: string, extraKeys: readonly string[] = []): boolean {
  const normalized = normalizeKey(key)
  for (const name of NORMALIZED_SENSITIVE_KEYS) {
    if (normalized.includes(name)) {
      return true
    }
  }
  for (const extra of extraKeys) {
    if (normalized.includes(normalizeKey(extra))) {
      return true
    }
  }
  return false
}

/**
 * Return a redacted copy of `value`: any property whose key matches a sensitive name (compared
 * separator-insensitively, so `api_key` matches `x-api-key`), any string that looks like a bearer
 * token or JWT, and any embedded `key=value` credential inside a larger string (e.g.
 * `access_token=live-secret` in a URL query or error message) is replaced with the mask. Objects
 * and arrays are walked up to `maxDepth`; cycles are detected and marked. A sensitive key is masked
 * from its descriptor without reading the value, a non-sensitive accessor is surfaced as
 * `"[Getter]"` rather than invoked, and a callable value is surfaced as `"[Function]"`, so
 * redaction never executes untrusted getter or `toJSON` code and never carries an executable hook
 * onto the copy — safe on arbitrary log payloads.
 */
export function redact(value: unknown, options: RedactOptions = {}): unknown {
  const mask = options.mask ?? "[REDACTED]"
  const maxDepth = options.maxDepth ?? 6
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new RangeError("redact requires maxDepth to be a non-negative integer")
  }
  const seen = new WeakSet<object>()

  const isSensitive = (key: string): boolean => isSensitiveKey(key, options.keys)

  const walk = (input: unknown, depth: number): unknown => {
    if (typeof input === "string") {
      if (looksSecret(input)) {
        return mask
      }
      // Mask embedded `<scheme> <token>` credentials (whole run) before the generic key=value
      // matcher, so a serialized `Authorization: Bearer <jwt>` never leaks the token after its
      // scheme.
      return maskEmbeddedSecrets(maskCredentialSchemes(input, mask), mask, isSensitive)
    }
    // A callable value (e.g. an own `toJSON`) is surfaced as an inert marker, never carried
    // through: a JSON log sink would otherwise invoke a surviving hook and could re-emit a captured
    // secret after redaction.
    if (typeof input === "function") {
      return "[Function]"
    }
    if (input === null || typeof input !== "object") {
      return input
    }
    // A `Date` is a leaf value, not a container to walk. Clone through the intrinsic getter so a
    // subclass or an own `toJSON` hook can't ride along on the copy and execute inside a
    // serializer; only the timestamp survives.
    if (input instanceof Date) {
      return new Date(Date.prototype.getTime.call(input))
    }
    if (seen.has(input)) {
      return "[Circular]"
    }
    if (depth >= maxDepth) {
      return "[Truncated]"
    }
    seen.add(input)
    let result: unknown
    if (Array.isArray(input)) {
      const items: unknown[] = []
      for (let index = 0; index < input.length; index++) {
        const descriptor = Object.getOwnPropertyDescriptor(input, index)
        if (descriptor?.get !== undefined) {
          // An indexed accessor is surfaced, never executed — the same non-invoking policy as
          // object accessors.
          items.push("[Getter]")
          continue
        }
        items.push(walk(descriptor?.value, depth + 1))
      }
      result = items
    } else {
      const entries: Array<[string, unknown]> = []
      for (const key of Object.keys(input)) {
        if (isSensitive(key)) {
          // Mask from the key alone — reading the value could invoke an untrusted getter that leaks
          // or throws.
          entries.push([key, mask])
          continue
        }
        const descriptor = Object.getOwnPropertyDescriptor(input, key)
        if (descriptor?.get !== undefined) {
          // A non-sensitive accessor is surfaced, never executed, so arbitrary getter code never
          // runs during logging.
          entries.push([key, "[Getter]"])
          continue
        }
        entries.push([key, walk(descriptor?.value, depth + 1)])
      }
      result = Object.fromEntries(entries)
    }
    seen.delete(input)
    return result
  }

  return walk(value, 0)
}
