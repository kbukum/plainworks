/**
 * Redaction for safe logging: strip credentials, tokens, and other secrets from a value before it reaches an observability sink, so a request/response is never logged with a live token or payload secret. Pure and structural — returns a redacted copy, never mutating the input.
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

function looksSecret(value: string): boolean {
  return JWT_PATTERN.test(value) || BEARER_PATTERN.test(value)
}

/**
 * Return a redacted copy of `value`: any property whose key matches a sensitive name (compared separator-insensitively, so `api_key` matches `x-api-key`), and any string that looks like a bearer token or JWT, is replaced with the mask. Objects and arrays are walked up to `maxDepth`; cycles are detected and marked. A sensitive key is masked from its descriptor without reading the value, a non-sensitive accessor is surfaced as `"[Getter]"` rather than invoked, and a callable value is surfaced as `"[Function]"`, so redaction never executes untrusted getter or `toJSON` code and never carries an executable hook onto the copy — safe on arbitrary log payloads.
 */
export function redact(value: unknown, options: RedactOptions = {}): unknown {
  const mask = options.mask ?? "[REDACTED]"
  const maxDepth = options.maxDepth ?? 6
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new RangeError("redact requires maxDepth to be a non-negative integer")
  }
  // Keys are matched lowercase with separators removed, so `x-api-key`, `api_key`, and `apikey` all hit the same entry.
  const normalizeKey = (key: string): string => key.toLowerCase().replace(/[-_.]/g, "")
  const sensitive = new Set(
    [...DEFAULT_SENSITIVE_KEYS, ...(options.keys ?? [])].map((key) => normalizeKey(key)),
  )
  const seen = new WeakSet<object>()

  const isSensitiveKey = (key: string): boolean => {
    const normalized = normalizeKey(key)
    for (const name of sensitive) {
      if (normalized.includes(name)) {
        return true
      }
    }
    return false
  }

  const walk = (input: unknown, depth: number): unknown => {
    if (typeof input === "string") {
      return looksSecret(input) ? mask : input
    }
    // A callable value (e.g. an own `toJSON`) is surfaced as an inert marker, never carried through: a JSON log sink would otherwise invoke a surviving hook and could re-emit a captured secret after redaction.
    if (typeof input === "function") {
      return "[Function]"
    }
    if (input === null || typeof input !== "object") {
      return input
    }
    // A `Date` is a leaf value, not a container to walk. Clone through the intrinsic getter so a subclass or an own `toJSON` hook can't ride along on the copy and execute inside a serializer; only the timestamp survives.
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
          // An indexed accessor is surfaced, never executed — the same non-invoking policy as object accessors.
          items.push("[Getter]")
          continue
        }
        items.push(walk(descriptor?.value, depth + 1))
      }
      result = items
    } else {
      const entries: Array<[string, unknown]> = []
      for (const key of Object.keys(input)) {
        if (isSensitiveKey(key)) {
          // Mask from the key alone — reading the value could invoke an untrusted getter that leaks or throws.
          entries.push([key, mask])
          continue
        }
        const descriptor = Object.getOwnPropertyDescriptor(input, key)
        if (descriptor?.get !== undefined) {
          // A non-sensitive accessor is surfaced, never executed, so arbitrary getter code never runs during logging.
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
