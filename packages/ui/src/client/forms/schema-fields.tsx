"use client"

import { Checkbox } from "@plainworks/elements/checkbox"
import { FieldDescription, FieldError, FieldLegend, FieldSet } from "@plainworks/elements/field"
import type {
  FormArraySchema,
  FormChoice,
  FormFieldSchema,
  FormObjectSchema,
  FormStringSchema,
} from "@plainworks/std/seam"
import { cn } from "@plainworks/theme"
import { type ReactElement, useId } from "react"
import { DateField } from "./date-field"
import { useFieldErrors, useFormContext } from "./form-context"
import { NumberField } from "./number-field"
import { SelectField } from "./select-field"
import { SwitchField } from "./switch-field"
import { TextField } from "./text-field"
import { TextareaField } from "./textarea-field"

/** Words {@link SchemaFields} shows that a schema does not carry. */
export interface SchemaFieldsLabels {
  /** Placeholder of a choice with no default. */
  readonly choose: string
}

export const defaultSchemaFieldsLabels: SchemaFieldsLabels = { choose: "Choose…" }

/** Props for {@link SchemaFields}. */
export interface SchemaFieldsProps {
  /** The fields to render, usually a form schema's `fields`. */
  readonly fields: FormObjectSchema
  readonly labels?: Partial<SchemaFieldsLabels> | undefined
  readonly className?: string | undefined
}

/**
 * Render the controls a JSON Schema subset describes, inside a `<Form>`: text, long text, date,
 * number, switch, choice, multi-choice, and nested groups. Nested controls are named
 * `parent.child`, which is the shape `createFieldsForm` and `createProtobufForm` decode, so the
 * same schema renders the form and validates its submission.
 */
export function SchemaFields({ fields, labels, className }: SchemaFieldsProps): ReactElement {
  const words = { ...defaultSchemaFieldsLabels, ...labels }
  return (
    <div className={cn("grid gap-5", className)}>
      <ObjectFields schema={fields} prefix="" words={words} />
    </div>
  )
}

interface FieldsProps {
  readonly prefix: string
  readonly words: SchemaFieldsLabels
}

function ObjectFields({
  schema,
  prefix,
  words,
}: FieldsProps & { readonly schema: FormObjectSchema }) {
  return Object.entries(schema.properties).map(([key, field]) => (
    <SchemaField
      key={key}
      name={`${prefix}${key}`}
      label={field.title ?? humanize(key)}
      field={field}
      required={schema.required?.includes(key) ?? false}
      words={words}
    />
  ))
}

interface SchemaFieldProps {
  readonly name: string
  readonly label: string
  readonly field: FormFieldSchema
  readonly required: boolean
  readonly words: SchemaFieldsLabels
}

function SchemaField({ name, label, field, required, words }: SchemaFieldProps): ReactElement {
  const common = { name, label, description: field.description, required: required || undefined }
  switch (field.type) {
    case "object":
      return (
        <FieldSet className="gap-4 rounded-lg border border-border/70 p-4">
          <FieldLegend>{label}</FieldLegend>
          {field.description === undefined ? null : (
            <FieldDescription>{field.description}</FieldDescription>
          )}
          <ObjectFields schema={field} prefix={`${name}.`} words={words} />
        </FieldSet>
      )
    case "boolean":
      return <SwitchField {...common} defaultChecked={field.default} />
    case "number":
    case "integer":
      return (
        <NumberField
          {...common}
          defaultValue={field.default}
          min={field.minimum}
          max={field.maximum}
          step={field.type === "integer" ? 1 : 0.1}
        />
      )
    case "array":
      return <ChoiceList {...common} field={field} />
    case "string":
      return <StringField {...common} field={field} words={words} />
  }
}

function StringField({
  field,
  words,
  ...common
}: {
  readonly name: string
  readonly label: string
  readonly description: string | undefined
  readonly required: true | undefined
  readonly field: FormStringSchema
  readonly words: SchemaFieldsLabels
}): ReactElement {
  const choices = choicesOf(field)
  if (choices !== undefined) {
    return (
      <SelectField
        {...common}
        options={choices.map((choice) => ({ value: choice.const, label: choice.title }))}
        {...(field.default === undefined
          ? { placeholder: words.choose }
          : { defaultValue: field.default })}
      />
    )
  }
  if (field.format === "textarea") return <TextareaField {...common} defaultValue={field.default} />
  if (field.format === "date") return <DateField {...common} defaultValue={field.default} />
  return <TextField {...common} defaultValue={field.default} />
}

// A labelled set of checkboxes sharing one name; each checked box submits its own value.
function ChoiceList({
  name,
  label,
  description,
  required,
  field,
}: {
  readonly name: string
  readonly label: string
  readonly description: string | undefined
  readonly required: true | undefined
  readonly field: FormArraySchema
}): ReactElement {
  const errors = useFieldErrors(name)
  const { pending } = useFormContext()
  const baseId = useId()
  const invalid = errors.length > 0
  const describedBy =
    [description === undefined ? null : `${baseId}description`, invalid ? `${baseId}error` : null]
      .filter((id) => id !== null)
      .join(" ") || undefined
  return (
    <FieldSet aria-describedby={describedBy} data-invalid={invalid || undefined} className="gap-2">
      <FieldLegend variant="label">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {" *"}
          </span>
        ) : null}
      </FieldLegend>
      {description === undefined ? null : (
        <FieldDescription id={`${baseId}description`}>{description}</FieldDescription>
      )}
      {(choicesOf(field.items) ?? []).map((choice) => {
        const id = `${baseId}${choice.const}`
        return (
          <div key={choice.const} className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={id}
              name={name}
              value={choice.const}
              defaultChecked={field.default?.includes(choice.const)}
              aria-invalid={invalid || undefined}
              disabled={pending || undefined}
            />
            <label htmlFor={id} className="text-sm">
              {choice.title}
            </label>
          </div>
        )
      })}
      {invalid ? (
        <FieldError id={`${baseId}error`} errors={errors.map((message) => ({ message }))} />
      ) : null}
    </FieldSet>
  )
}

function choicesOf(field: FormStringSchema): readonly FormChoice[] | undefined {
  return field.oneOf ?? field.enum?.map((value) => ({ const: value, title: value }))
}

function humanize(key: string): string {
  const words = key
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
