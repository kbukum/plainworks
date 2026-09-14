"use client"

// Re-export-only barrel for the forms concern — a schema-validated form on React 19 Actions plus
// the labelled field wrapper and the field set that composes elements inputs onto it.
export type { FieldControlProps, FieldOrientation, FieldProps } from "./field"
export { Field } from "./field"
export type {
  CheckboxFieldProps,
  DateFieldProps,
  NumberFieldProps,
  SelectFieldOption,
  SelectFieldProps,
  SwitchFieldProps,
  TextareaFieldProps,
  TextFieldProps,
} from "./fields"
export {
  CheckboxField,
  DateField,
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "./fields"
export type { FormLabels, FormProps, SchemaFormProps, SchemalessFormProps } from "./form"
export { defaultFormLabels, Form } from "./form"
export type { FieldErrors, FormContextValue } from "./form-context"
export { useFieldErrors, useFormContext } from "./form-context"
export type { FormFieldValue, FormValues } from "./form-data"
export type { FormSubmitProps } from "./form-submit"
export { FormSubmit } from "./form-submit"
