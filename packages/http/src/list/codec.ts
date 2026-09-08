import { HttpError } from "../error"

/**
 * The REST-value escape codec — the round-trippable pair the list dialect uses so a filter value
 * carrying the list delimiter (`,`) or the escape char (`\`) survives the `field=op.value` wire.
 * `escape*` (serialize side, used by `buildListQuery`) and `unescapeValue`/`parseDelimitedList`
 * (parse side, used by a REST backend) are defined together here so they stay inverses by
 * construction — never two hand-mirrored halves in separate packages.
 */

/**
 * Escape one value of a comma-delimited `in.(…)` list so a value carrying the delimiter or the escape
 * character survives the backend array parser, which treats `\` as an escape and `,` as a separator:
 * a literal backslash becomes `\\` and a literal comma `\,`. Backslash is escaped first so an escaped
 * comma is not double-escaped. Without this, `["a,b"]` would arrive as two values, not one. An empty
 * value is rejected as an `http/request` error: it cannot round-trip — `[]` and `[""]` would share
 * the `in.()` wire form — so the serialize side refuses it rather than emitting an ambiguous wire.
 */
export function escapeListValue(value: string): string {
  if (value === "") {
    throw HttpError.request(
      "An `in.(…)` list value cannot be empty — it cannot round-trip the wire.",
    )
  }
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,")
}

/**
 * Escape a scalar value so a literal backslash survives the backend's `\`-unescaping (`\` → `\\`). No
 * other character needs escaping: the server splits operator from value on the first `.` only, so a
 * value's own dots are safe.
 */
export function escapeScalarValue(value: string): string {
  return value.replace(/\\/g, "\\\\")
}

/**
 * Reverse the builder's backslash escaping: any `\x` collapses to `x`, so `\\` → `\` (a literal
 * backslash round-trips) and `\,`/`\(`/`\)` → their literal char. The inverse of
 * {@link escapeScalarValue}.
 */
export function unescapeValue(value: string): string {
  return value.replace(/\\(.)/g, "$1")
}

/**
 * Split a comma-separated `in.(…)` list body into its values, honouring backslash escapes for literal
 * commas and backslashes — the inverse of joining {@link escapeListValue}-escaped values with `,`.
 * Each returned value is already unescaped. The parse side is lossless: an empty body is the empty
 * list (`in.()` round-trips `[]`), an empty item between delimiters survives, and a dangling escape
 * (a terminal `\` with nothing after it) is kept as a literal backslash, mirroring
 * {@link unescapeValue} — malformed input is preserved, never silently dropped into a different
 * filter. (Re-serializing a preserved empty item is rejected by {@link escapeListValue}.)
 */
export function parseDelimitedList(inner: string): string[] {
  if (inner === "") {
    return []
  }
  const values: string[] = []
  let current = ""
  let escaped = false

  for (const char of inner) {
    if (escaped) {
      current += char
      escaped = false
    } else if (char === "\\") {
      escaped = true
    } else if (char === ",") {
      values.push(current)
      current = ""
    } else {
      current += char
    }
  }

  if (escaped) {
    // A terminal `\` escapes nothing; keep it as a literal backslash, mirroring unescapeValue, so
    // malformed input is preserved rather than silently changing the filter's meaning.
    current += "\\"
  }

  values.push(current)

  return values
}
