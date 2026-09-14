"use client"

import { type Context, createContext, use } from "react"

/**
 * Validation messages for a single field, keyed by field `name`. A field with no entry (or an empty
 * array) is valid. Form-level messages that a schema reports with an empty issue path collect under
 * the reserved {@link FORM_ERROR_KEY}.
 */
export type FieldErrors = Readonly<Record<string, readonly string[]>>

/** Reserved {@link FieldErrors} key for messages a schema reports without a field path. */
export const FORM_ERROR_KEY = ""

/**
 * The per-instance form state shared with the fields and submit button through {@link use}. `Form`
 * builds it from its own `useState` (validation errors) and `useTransition` (pending) — never a
 * module-level singleton, so two forms on one page never share validation state.
 */
export interface FormContextValue {
  /** Current validation messages keyed by field `name` (plus the form-level key). */
  readonly errors: FieldErrors
  /** True while the form action is running, so fields and the submit button can disable. */
  readonly pending: boolean
}

// The default is an empty, non-pending state so a field composed outside a `<Form>` (e.g. a filter
// control in the data concern) renders as valid and enabled rather than throwing.
const EMPTY_FORM_STATE: FormContextValue = { errors: {}, pending: false }

const FormContext: Context<FormContextValue> = createContext<FormContextValue>(EMPTY_FORM_STATE)

/** Read the surrounding {@link FormContextValue}; the empty state when rendered outside a `<Form>`. */
export function useFormContext(): FormContextValue {
  return use(FormContext)
}

/** The validation messages for one field `name`, or an empty array when it is valid. */
export function useFieldErrors(name: string): readonly string[] {
  return useFormContext().errors[name] ?? []
}

export { FormContext }
