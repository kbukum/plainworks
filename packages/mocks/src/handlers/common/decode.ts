/**
 * Declarative decoding of untrusted request bodies at the HTTP boundary. Every domain handler
 * declares the fields a client may write; anything failing its declared shape rejects with 400
 * instead of being laundered into an entity.
 */

import { isRecord } from "@plainworks/std"

/** The allowed shape of one client-writable field. */
export type FieldSpec = (
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "stringArray" }
  | { kind: "objectArray"; item: InputSpec }
) & {
  /**
   * Require the field (used inside `objectArray` item specs — top-level bodies stay partial
   * because entity factories supply defaults for omitted fields).
   */
  required?: boolean
}

/** Map of client-writable field names to their shapes. */
export type InputSpec = Record<string, FieldSpec>

type Decoded = { ok: true; value: unknown } | { ok: false }

function decodeValue(value: unknown, spec: FieldSpec): Decoded {
  switch (spec.kind) {
    case "string":
      return typeof value === "string" ? { ok: true, value } : { ok: false }
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false }
    case "boolean":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false }
    case "enum":
      return typeof value === "string" && spec.values.includes(value)
        ? { ok: true, value }
        : { ok: false }
    case "stringArray":
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? { ok: true, value }
        : { ok: false }
    case "objectArray": {
      if (!Array.isArray(value)) return { ok: false }
      const items: unknown[] = []
      for (const entry of value) {
        const decoded = decodeInput(entry, spec.item)
        if (decoded === null) return { ok: false }
        items.push(decoded)
      }
      return { ok: true, value: items }
    }
  }
}

/**
 * Decode `body` against `spec`, keeping only declared fields. Returns `null` when the body is not
 * a plain object, a required field is absent, or any present field fails its shape; absent
 * optional fields are simply omitted (the result is a partial by design — entity factories supply
 * defaults). Every emitted field is runtime-validated against its spec, so the `Partial<T>` is
 * checked, not blindly asserted.
 */
export function decodeInput<T>(body: unknown, spec: InputSpec): Partial<T> | null {
  if (!isRecord(body)) return null
  const out: Record<string, unknown> = {}
  for (const [field, fieldSpec] of Object.entries(spec)) {
    const value = body[field]
    if (value === undefined) {
      if (fieldSpec.required) return null
      continue
    }
    const decoded = decodeValue(value, fieldSpec)
    if (!decoded.ok) return null
    out[field] = decoded.value
  }
  // The spec validated every emitted field's runtime shape, so the partial is sound.
  return out as Partial<T>
}
