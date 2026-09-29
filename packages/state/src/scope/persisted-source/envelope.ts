/**
 * The wire format for a **versioned** persisted value: a small framed string that stamps the schema
 * version beside the serializer-encoded payload, so a later read knows which version produced the
 * value and whether it must be migrated forward. Only string-backed scopes with a `versioning`
 * policy write this frame; a value with no policy is stored raw, exactly as before.
 *
 * The frame is a pure value codec — no host, no serializer knowledge. It carries the payload as an
 * opaque string; decoding the payload back into a value (and running the migration) stays with the
 * source that owns the read trust boundary.
 */

/** A version older than any real policy: the version a pre-versioning (unwrapped) payload reads as. */
export const LEGACY_VERSION = 0

// A control-character sentinel (`U+0001`) frames a versioned value. JSON output always begins with
// `{`, `[`, `"`, a digit, `-`, or a `true`/`false`/`null` keyword, so a JSON-serialized legacy
// value can never start with this marker — the frame cannot be confused with a bare value persisted
// before versioning, even one that happens to share the old envelope's shape. The version is
// written as decimal digits between the two markers, then the opaque payload:
//
// \u0001pw:v{version}\u0001{payload}
const MARK = "\u0001"
const TAG = `${MARK}pw:v`

function legacy(raw: string): { readonly version: number; readonly payload: string } {
  return { version: LEGACY_VERSION, payload: raw }
}

/** Stamp the current `version` on an already-encoded `payload`, producing the stored string. */
export function encodeEnvelope(version: number, payload: string): string {
  return `${TAG}${version}${MARK}${payload}`
}

/**
 * Recover the `{ version, payload }` a read must act on. A stored string framed by
 * {@link encodeEnvelope} yields its stamped version; a value persisted **before** versioning was
 * added — a bare JSON value, or a non-JSON string from the identity serializer — is reported as
 * {@link LEGACY_VERSION} with the original raw carried through as the payload, so the migration
 * path upgrades unversioned state rather than dropping it.
 */
export function decodeEnvelope(raw: string): {
  readonly version: number
  readonly payload: string
} {
  if (!raw.startsWith(TAG)) {
    return legacy(raw)
  }
  const end = raw.indexOf(MARK, TAG.length)
  if (end === -1) {
    return legacy(raw)
  }
  const digits = raw.slice(TAG.length, end)
  if (!/^\d+$/.test(digits)) {
    return legacy(raw)
  }
  return { version: Number(digits), payload: raw.slice(end + 1) }
}
