/**
 * Declarative decoding of untrusted request bodies at the HTTP boundary. Every domain handler
 * declares the fields a client may write; anything failing its declared shape rejects with 400
 * instead of being laundered into an entity.
 */

import { isRecord } from "@plainworks/std"

/**
 * The allowed spec for one client-writable field, matched to that field's declared type `V`: a
 * `number` field only accepts `{ kind: "number" }`, an array of objects only
 * `{ kind: "objectArray" }` (recursing into the element type), and so on. A spec whose `kind`
 * disagrees with the field's type fails to compile, so a decoded body can never be laundered into
 * `Partial<T>` as the wrong runtime type.
 */
type ValueFieldSpec<V> = [V] extends [boolean]
  ? { kind: "boolean" }
  : [V] extends [number]
    ? { kind: "number" }
    : [V] extends [readonly string[]]
      ? { kind: "stringArray" }
      : [V] extends [readonly (infer E)[]]
        ? { kind: "objectArray"; item: InputSpec<E> }
        : [V] extends [string]
          ? { kind: "string" } | { kind: "enum"; values: readonly string[] }
          : never

export type FieldSpecFor<V> = ValueFieldSpec<NonNullable<V>> & {
  /**
   * Require the field (used inside `objectArray` item specs — top-level bodies stay partial
   * because entity factories supply defaults for omitted fields).
   */
  required?: boolean
} & (null extends V
    ? {
        /** Allow `null` as an explicit value, e.g. to clear an optional field on update. */ nullable?: boolean
      }
    : { nullable?: false })

/** Map of an entity input's client-writable fields to a spec matched to each field's type. */
export type InputSpec<T> = { [K in keyof T]?: FieldSpecFor<T[K]> }

// Erased, structural mirror of the generic specs above. The runtime walker keeps its plain
// discriminated-union switch here while the public types carry the per-field type guarantees.
type ErasedFieldSpec = { required?: boolean; nullable?: boolean } & (
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "enum"; values: readonly string[] }
  | { kind: "stringArray" }
  | { kind: "objectArray"; item: ErasedInputSpec }
)
type ErasedInputSpec = Record<string, ErasedFieldSpec>

type Decoded = { ok: true; value: unknown } | { ok: false }

function decodeValue(value: unknown, spec: ErasedFieldSpec): Decoded {
  if (spec.nullable && value === null) {
    return { ok: true, value: null }
  }
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
        const decoded = decodeRecord(entry, spec.item)
        if (decoded === null) return { ok: false }
        items.push(decoded)
      }
      return { ok: true, value: items }
    }
  }
}

// Walk an erased spec over an untrusted body, keeping only declared, well-typed fields.
function decodeRecord(body: unknown, spec: ErasedInputSpec): Record<string, unknown> | null {
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
  return out
}

/**
 * Decode `body` against `spec`, keeping only declared fields. Returns `null` when the body is not
 * a plain object, a required field is absent, or any present field fails its shape; absent
 * optional fields are simply omitted (the result is a partial by design — entity factories supply
 * defaults). Every emitted field is runtime-validated against its spec, so the `Partial<T>` is
 * checked, not blindly asserted.
 */
export function decodeInput<T>(body: unknown, spec: InputSpec<T>): Partial<T> | null {
  // Bridge the generic spec to the erased walker once here: `InputSpec<T>` is a structural
  // refinement of `ErasedInputSpec` by construction, so the runtime walk stays plain.
  const decoded = decodeRecord(body, spec as unknown as ErasedInputSpec)
  return decoded as Partial<T> | null
}
