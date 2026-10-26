import { type DescField, type DescMessage, ScalarType } from "@bufbuild/protobuf"
import type { FormFieldSchema, FormObjectSchema } from "@plainworks/std/seam"

const MAX_DEPTH = 8

/**
 * Describe a request message as form fields. Scalars, enums, enum lists, and nested messages map
 * onto the JSON Schema subset; bytes, maps, message lists, scalar lists, and well-known types have
 * no control here, so a form for them is hand-built. Keys are JSON names, matching control names.
 */
export function protobufFields(schema: DescMessage): FormObjectSchema {
  return messageFields(schema, new Set(), 0)
}

function messageFields(
  schema: DescMessage,
  seen: ReadonlySet<string>,
  depth: number,
): FormObjectSchema {
  const path = new Set([...seen, schema.typeName])
  const properties: [string, FormFieldSchema][] = []
  for (const field of schema.fields) {
    const described = fieldSchema(field, path, depth)
    if (described !== undefined) properties.push([field.jsonName, described])
  }
  return { type: "object", properties: Object.fromEntries(properties) }
}

function fieldSchema(field: DescField, seen: ReadonlySet<string>, depth: number) {
  const title = humanize(field.name)
  if (field.fieldKind === "scalar") return scalarSchema(field.scalar, title)
  if (field.fieldKind === "enum") {
    const oneOf = enumChoices(field.enum)
    const [first] = oneOf
    const schema: FormFieldSchema = { type: "string", title, oneOf }
    return first === undefined ? schema : { ...schema, default: first.const }
  }
  if (field.fieldKind === "list" && field.listKind === "enum") {
    return {
      type: "array",
      title,
      items: { type: "string", oneOf: enumChoices(field.enum) },
    } as const
  }
  if (
    field.fieldKind === "message" &&
    !field.message.typeName.startsWith("google.protobuf.") &&
    !seen.has(field.message.typeName) &&
    depth < MAX_DEPTH
  ) {
    return { ...messageFields(field.message, seen, depth + 1), title }
  }
  return undefined
}

function scalarSchema(scalar: ScalarType, title: string): FormFieldSchema | undefined {
  switch (scalar) {
    case ScalarType.STRING:
      return { type: "string", title }
    case ScalarType.BOOL:
      return { type: "boolean", title }
    case ScalarType.FLOAT:
    case ScalarType.DOUBLE:
      return { type: "number", title }
    case ScalarType.BYTES:
      return undefined
    default:
      return { type: "integer", title }
  }
}

function enumChoices(schema: DescField["enum"] & object) {
  return schema.values.map((value) => ({ const: value.name, title: humanize(value.localName) }))
}

function humanize(name: string): string {
  const words = name.toLowerCase().split("_").filter(Boolean).join(" ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}
