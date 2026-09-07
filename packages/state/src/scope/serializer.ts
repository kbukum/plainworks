import type { StateSerializer } from "@plainworks/std"
import { StateSourceError } from "../errors"

/**
 * A JSON serializer for a storage-backed scope: `JSON.stringify`/`JSON.parse` around the value. It is
 * a **syntax codec only** — it decodes a JSON string into a value of the declared shape but does not
 * prove that shape. Persisted media are untrusted, so validating the decoded value is the job of the
 * optional `schema` at the source read boundary (`SourceSpec.schema`); pass one for any value a user
 * can tamper with. `deserialize` throws the native `SyntaxError` on a malformed persisted string,
 * which the source that owns the read maps to a typed `StateSourceError` rather than returning a
 * fabricated value.
 *
 * `serialize` rejects a value `JSON.stringify` cannot represent — top-level `undefined`, a function,
 * or a symbol all yield `undefined` (not a string), which would otherwise persist an invalid entry
 * that fails to parse on the way back. It throws a typed {@link StateSourceError} instead, exactly as
 * the HTTP JSON codec guards its encode boundary.
 */
export function jsonSerializer<Value>(): StateSerializer<Value> {
  return {
    serialize: (value) => {
      const encoded = JSON.stringify(value)
      if (encoded === undefined) {
        throw new StateSourceError(
          "Cannot JSON-serialize a value of `undefined`, a function, or a symbol for storage.",
        )
      }
      return encoded
    },
    deserialize: (raw) => JSON.parse(raw) as Value,
  }
}

/**
 * The identity serializer for a scope whose value is already a plain string (a theme name, a raw
 * token-free preference). Skips JSON quoting, so the persisted cookie/URL value is the string as-is —
 * more readable and smaller than a JSON-encoded string.
 */
export const stringSerializer: StateSerializer<string> = {
  serialize: (value) => value,
  deserialize: (raw) => raw,
}
