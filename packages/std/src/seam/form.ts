import type { StandardSchemaV1 } from "./schema"

/** A schema may bind a server path to its control name without application mapping. */
export interface FormSchema<Output> extends StandardSchemaV1<unknown, Output> {
  readonly fieldName?: (field: string, format: "protobuf" | "json") => string
  /** The fields a schema-driven form renders, in a JSON Schema subset. */
  readonly fields?: FormObjectSchema
}

/** Shared keywords of every {@link FormFieldSchema}. */
interface FormFieldBase {
  /** The field's label. Defaults to the property name. */
  readonly title?: string
  /** Supporting text shown under the label. */
  readonly description?: string
}

/** One labelled choice of an enumerated string, as JSON Schema's `oneOf` of `const`s. */
export interface FormChoice {
  readonly const: string
  readonly title: string
}

/**
 * A text field. `enum` or `oneOf` makes it a choice; `format: "textarea"` asks for several lines
 * and `format: "date"` for a calendar date (`YYYY-MM-DD`).
 */
export interface FormStringSchema extends FormFieldBase {
  readonly type: "string"
  readonly default?: string
  readonly enum?: readonly string[]
  readonly oneOf?: readonly FormChoice[]
  readonly minLength?: number
  readonly maxLength?: number
  /** A regular expression the whole value must match, compiled with the `u` flag. */
  readonly pattern?: string
  readonly format?: "date" | "textarea"
}

/** A number field; `integer` refuses fractions. */
export interface FormNumberSchema extends FormFieldBase {
  readonly type: "number" | "integer"
  readonly default?: number
  readonly minimum?: number
  readonly maximum?: number
}

/** An on/off field. */
export interface FormBooleanSchema extends FormFieldBase {
  readonly type: "boolean"
  readonly default?: boolean
}

/** A set of choices picked from a fixed list. */
export interface FormArraySchema extends FormFieldBase {
  readonly type: "array"
  readonly items: FormStringSchema &
    ({ readonly enum: readonly string[] } | { readonly oneOf: readonly FormChoice[] })
  readonly default?: readonly string[]
  readonly minItems?: number
  readonly maxItems?: number
}

/** A group of fields; nested controls are named `parent.child`. */
export interface FormObjectSchema extends FormFieldBase {
  readonly type: "object"
  readonly properties: Readonly<Record<string, FormFieldSchema>>
  readonly required?: readonly string[]
}

/**
 * One field of the JSON Schema subset a schema-driven form renders and validates. It keeps only
 * the keywords a form control can honour, so a schema in this subset is also valid JSON Schema.
 */
export type FormFieldSchema =
  | FormStringSchema
  | FormNumberSchema
  | FormBooleanSchema
  | FormArraySchema
  | FormObjectSchema
