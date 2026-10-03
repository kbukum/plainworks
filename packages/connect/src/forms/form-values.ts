import {
  type DescField,
  type DescMessage,
  fromJson,
  type JsonObject,
  type JsonValue,
  type MessageShape,
  ScalarType,
} from "@bufbuild/protobuf"
import { FeatureSet_FieldPresence } from "@bufbuild/protobuf/wkt"
import { isRecord, PlainError } from "@plainworks/std"

/** Invalid control input, distinct from a validator compilation/evaluation failure. */
export class FormValueError extends PlainError<"connect/form-value"> {
  constructor(
    readonly field: string,
    options?: { cause?: unknown },
  ) {
    super("connect/form-value", "Enter a valid value.", options)
  }
}

type Values = Readonly<Record<string, string | readonly string[]>>

export function decodeFormValues<D extends DescMessage>(
  schema: D,
  input: unknown,
): MessageShape<D> {
  if (!isRecord(input) || Object.keys(input).length > 1000) throw new FormValueError("")
  const entries: [string, string | readonly string[]][] = []
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") entries.push([key, value])
    else if (
      Array.isArray(value) &&
      value.every((item): item is string => typeof item === "string")
    ) {
      entries.push([key, value])
    } else throw new FormValueError(key)
  }
  const values: Values = Object.fromEntries(entries)
  const used = new Set<string>()
  const json = decodeMessage(schema, values, used, "", 0)
  for (const key of Object.keys(values)) {
    if (!used.has(key)) throw new FormValueError(key)
  }
  try {
    return fromJson(schema, json)
  } catch (cause) {
    throw new FormValueError("", { cause })
  }
}

function decodeMessage(
  schema: DescMessage,
  values: Values,
  used: Set<string>,
  prefix: string,
  depth: number,
): JsonObject {
  if (depth > 32) throw new FormValueError(prefix)
  const entries: [string, JsonValue][] = []
  for (const field of schema.fields) {
    const name = `${prefix}${field.jsonName}`
    const raw = Object.hasOwn(values, name) ? values[name] : undefined
    if (Object.hasOwn(values, name)) used.add(name)
    let value: JsonValue | undefined
    if (field.fieldKind === "message" && field.message.typeName !== "google.protobuf.Timestamp") {
      if (Object.keys(values).some((key) => key.startsWith(`${name}.`))) {
        value = decodeMessage(field.message, values, used, `${name}.`, depth + 1)
      } else if (raw !== undefined) throw new FormValueError(name)
    } else if (field.fieldKind === "list" && field.listKind === "message") {
      if (raw !== undefined) throw new FormValueError(name)
      const indices = new Set<number>()
      for (const key of Object.keys(values)) {
        if (!key.startsWith(`${name}[`)) continue
        const match = /^\[(0|[1-9]\d*)\]\./.exec(key.slice(name.length))
        if (match === null) throw new FormValueError(name)
        indices.add(Number(match[1]))
      }
      if (indices.size > 1000) throw new FormValueError(name)
      if (indices.size > 0) {
        value = []
        for (let index = 0; index < indices.size; index++) {
          if (!indices.has(index)) throw new FormValueError(name)
          value.push(decodeMessage(field.message, values, used, `${name}[${index}].`, depth + 1))
        }
      }
    } else if (raw !== undefined) {
      if (field.fieldKind === "map") throw new FormValueError(name)
      if (field.fieldKind === "list") {
        const list = typeof raw === "string" ? [raw] : raw
        if (list.length > 1000) throw new FormValueError(name)
        value = list.map((item) => scalarValue(field, item, name))
      } else {
        if (typeof raw !== "string") throw new FormValueError(name)
        if (
          raw === "" &&
          ((field.presence === FeatureSet_FieldPresence.EXPLICIT &&
            field.scalar !== ScalarType.STRING &&
            field.scalar !== ScalarType.BYTES) ||
            field.fieldKind === "message")
        )
          continue
        value = scalarValue(field, raw, name)
      }
    }
    if (value !== undefined) {
      try {
        fromJson(schema, { [field.jsonName]: value })
      } catch (cause) {
        throw new FormValueError(name, { cause })
      }
      entries.push([field.jsonName, value])
    }
  }
  return Object.fromEntries(entries)
}

function scalarValue(field: DescField, raw: string, name: string): JsonValue {
  if (field.scalar === ScalarType.BOOL) {
    if (raw === "true" || raw === "on") return true
    if (raw === "false") return false
    throw new FormValueError(name)
  }
  if (field.enum !== undefined && /^-?\d+$/.test(raw)) return Number(raw)
  return raw
}
