import type { Json } from "../encoding/json"
import { PlainError } from "../errors"
import { isRecord } from "../guard"
import type {
  FormArraySchema,
  FormFieldSchema,
  FormNumberSchema,
  FormObjectSchema,
  FormSchema,
  FormStringSchema,
} from "./form"
import type { StandardSchemaIssue } from "./schema"

/** A field schema cannot be honoured by a form, such as a broken pattern or unknown required name. */
export class FormFieldsError extends PlainError<"std/form-fields"> {
  override readonly name: string = "FormFieldsError"
  constructor(message: string, options?: { cause?: unknown }) {
    super("std/form-fields", message, options)
  }
}

/** Builds the message for one broken rule; `name` is the control name, such as `stop.word`. */
export type FormFieldMessage = (name: string, field: FormFieldSchema) => string

/** Message overrides for {@link createFieldsForm}. */
export interface FormFieldMessages {
  readonly required?: FormFieldMessage
  readonly format?: FormFieldMessage
  readonly range?: FormFieldMessage
  readonly value?: FormFieldMessage
}

/** The typed JSON object a {@link createFieldsForm} schema produces. */
export type FormFieldsValue = Readonly<Record<string, Json>>

type Reason = "REQUIRED" | "INVALID_FORMAT" | "OUT_OF_RANGE" | "INVALID_VALUE"

const DEFAULT_MESSAGES: Required<FormFieldMessages> = {
  required: () => "This field is required.",
  format: () => "Enter a valid value.",
  range: (_name, field) => rangeMessage(field),
  value: () => "Choose one of the listed values.",
}

/**
 * Build a {@link FormSchema} from a JSON Schema subset. It renders through `fields` and decodes the
 * submitted control strings into typed JSON: numbers, booleans, choice lists, and nested objects
 * named `parent.child`. An empty optional control is left out, an unchecked switch is `false`, and
 * an unknown control is refused. Issues carry the `REQUIRED`, `INVALID_FORMAT`, `OUT_OF_RANGE`, or
 * `INVALID_VALUE` reason. Throws {@link FormFieldsError} when the schema itself is unusable.
 */
export function createFieldsForm(
  fields: FormObjectSchema,
  messages: FormFieldMessages = {},
): FormSchema<FormFieldsValue> & { readonly fields: FormObjectSchema } {
  const patterns = new Map<FormStringSchema, RegExp>()
  checkObject(fields, "", patterns)
  const text = { ...DEFAULT_MESSAGES, ...messages }
  return {
    fields,
    fieldName: (field) => field,
    "~standard": {
      version: 1,
      vendor: "plainworks",
      validate: (input) => {
        if (!isControlRecord(input)) {
          return { issues: [{ reason: "INVALID_VALUE", message: text.format("", fields) }] }
        }
        const decoder = new Decoder(input, text, patterns)
        const value = decoder.object(fields, [], true)
        for (const name of Object.keys(input)) {
          if (!decoder.used.has(name)) {
            decoder.issues.push({ reason: "INVALID_VALUE", message: text.value(name, fields) })
          }
        }
        return decoder.issues.length > 0 ? { issues: decoder.issues } : { value: value ?? {} }
      },
    },
  }
}

type Controls = Readonly<Record<string, string | readonly string[]>>

function isControlRecord(input: unknown): input is Controls {
  if (!isRecord(input)) return false
  return Object.values(input).every(
    (value) =>
      typeof value === "string" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string")),
  )
}

class Decoder {
  readonly issues: StandardSchemaIssue[] = []
  readonly used = new Set<string>()

  constructor(
    private readonly input: Controls,
    private readonly text: Required<FormFieldMessages>,
    private readonly patterns: ReadonlyMap<FormStringSchema, RegExp>,
  ) {}

  // Returns undefined when an optional group was left entirely empty.
  object(schema: FormObjectSchema, path: readonly string[], required: boolean) {
    if (!required && !this.provided(schema, path)) {
      this.markUsed(schema, path)
      return undefined
    }
    const entries: [string, Json][] = []
    for (const [key, field] of Object.entries(schema.properties)) {
      const child = [...path, key]
      const isRequired = schema.required?.includes(key) ?? false
      const value =
        field.type === "object"
          ? this.object(field, child, isRequired)
          : this.leaf(field, child, isRequired)
      if (value !== undefined) entries.push([key, value])
    }
    return Object.fromEntries(entries)
  }

  private leaf(
    field: Exclude<FormFieldSchema, FormObjectSchema>,
    path: readonly string[],
    required: boolean,
  ) {
    const name = path.join(".")
    this.used.add(name)
    const raw = Object.hasOwn(this.input, name) ? this.input[name] : undefined
    if (field.type === "array") return this.list(field, path, raw, required)
    if (Array.isArray(raw)) return this.fail(path, "INVALID_VALUE", this.text.value(name, field))
    const value = typeof raw === "string" ? raw : ""
    if (field.type === "boolean") {
      if (value === "" || value === "false") return false
      if (value === "true" || value === "on") return true
      return this.fail(path, "INVALID_VALUE", this.text.value(name, field))
    }
    if (value === "") {
      return required ? this.fail(path, "REQUIRED", this.text.required(name, field)) : undefined
    }
    if (field.type === "string") return this.string(field, path, value)
    return this.number(field, path, value)
  }

  private string(field: FormStringSchema, path: readonly string[], value: string) {
    const name = path.join(".")
    const choices = choiceValues(field)
    if (choices !== undefined) {
      return choices.includes(value)
        ? value
        : this.fail(path, "INVALID_VALUE", this.text.value(name, field))
    }
    const length = [...value].length
    if (
      (field.minLength !== undefined && length < field.minLength) ||
      (field.maxLength !== undefined && length > field.maxLength)
    ) {
      return this.fail(path, "OUT_OF_RANGE", this.text.range(name, field))
    }
    const pattern = this.patterns.get(field)
    if (
      (pattern !== undefined && !pattern.test(value)) ||
      (field.format === "date" && !isDate(value))
    ) {
      return this.fail(path, "INVALID_FORMAT", this.text.format(name, field))
    }
    return value
  }

  private number(field: FormNumberSchema, path: readonly string[], value: string) {
    const name = path.join(".")
    const parsed = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim())
      ? Number(value)
      : Number.NaN
    if (!Number.isFinite(parsed) || (field.type === "integer" && !Number.isSafeInteger(parsed))) {
      return this.fail(path, "INVALID_FORMAT", this.text.format(name, field))
    }
    if (
      (field.minimum !== undefined && parsed < field.minimum) ||
      (field.maximum !== undefined && parsed > field.maximum)
    ) {
      return this.fail(path, "OUT_OF_RANGE", this.text.range(name, field))
    }
    return parsed
  }

  private list(
    field: FormArraySchema,
    path: readonly string[],
    raw: string | readonly string[] | undefined,
    required: boolean,
  ) {
    const name = path.join(".")
    const items = raw === undefined ? [] : typeof raw === "string" ? [raw] : [...raw]
    if (required && items.length === 0)
      return this.fail(path, "REQUIRED", this.text.required(name, field))
    const choices = choiceValues(field.items) ?? []
    if (items.some((item) => !choices.includes(item)) || new Set(items).size !== items.length) {
      return this.fail(path, "INVALID_VALUE", this.text.value(name, field))
    }
    if (
      (field.minItems !== undefined && items.length < field.minItems) ||
      (field.maxItems !== undefined && items.length > field.maxItems)
    ) {
      return this.fail(path, "OUT_OF_RANGE", this.text.range(name, field))
    }
    return items
  }

  private fail(path: readonly string[], reason: Reason, message: string): undefined {
    this.issues.push({ path, reason, message })
    return undefined
  }

  // Unchecked switches alone do not make an optional group present.
  private provided(schema: FormObjectSchema, path: readonly string[]): boolean {
    return Object.entries(schema.properties).some(([key, field]) => {
      const child = [...path, key]
      if (field.type === "object") return this.provided(field, child)
      const raw = this.input[child.join(".")]
      if (field.type === "boolean") {
        return Object.hasOwn(this.input, child.join(".")) && raw !== "" && raw !== "false"
      }
      return (
        Object.hasOwn(this.input, child.join(".")) &&
        raw !== "" &&
        !(Array.isArray(raw) && raw.length === 0)
      )
    })
  }

  private markUsed(schema: FormObjectSchema, path: readonly string[]): void {
    for (const [key, field] of Object.entries(schema.properties)) {
      const child = [...path, key]
      if (field.type === "object") this.markUsed(field, child)
      else this.used.add(child.join("."))
    }
  }
}

function choiceValues(field: FormStringSchema): readonly string[] | undefined {
  return field.oneOf?.map((choice) => choice.const) ?? field.enum
}

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

function rangeMessage(field: FormFieldSchema): string {
  if (field.type === "string") return bounds("Use", field.minLength, field.maxLength, "characters")
  if (field.type === "array") return bounds("Pick", field.minItems, field.maxItems, "items")
  if (field.type === "number" || field.type === "integer") {
    return bounds("Enter a value", field.minimum, field.maximum, "")
  }
  return "Enter a value in range."
}

function bounds(
  lead: string,
  min: number | undefined,
  max: number | undefined,
  unit: string,
): string {
  const suffix = unit === "" ? "." : ` ${unit}.`
  if (min !== undefined && max !== undefined) return `${lead} from ${min} to ${max}${suffix}`
  if (min !== undefined) return `${lead} of at least ${min}${suffix}`
  return `${lead} of at most ${max ?? 0}${suffix}`
}

function checkObject(
  schema: FormObjectSchema,
  prefix: string,
  patterns: Map<FormStringSchema, RegExp>,
) {
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(schema.properties, name)) {
      throw new FormFieldsError(`Required field "${prefix}${name}" is not a property.`)
    }
  }
  for (const [key, field] of Object.entries(schema.properties)) {
    if (key === "" || /[.[\]]/.test(key)) {
      throw new FormFieldsError(`Field name "${prefix}${key}" cannot hold ".", "[", or "]".`)
    }
    if (field.type === "object") checkObject(field, `${prefix}${key}.`, patterns)
    if (field.type === "string" && field.pattern !== undefined) {
      try {
        patterns.set(field, new RegExp(`^(?:${field.pattern})$`, "u"))
      } catch (cause) {
        throw new FormFieldsError(`Field "${prefix}${key}" has an invalid pattern.`, { cause })
      }
    }
  }
}
