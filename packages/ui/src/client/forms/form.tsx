"use client"

import { FieldError } from "@plainworks/elements/field"
import { type StandardSchemaV1, validateWithSchema } from "@plainworks/std"
import { cn } from "@plainworks/theme"
import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useState,
  useTransition,
} from "react"
import { type FieldErrors, FORM_ERROR_KEY, FormContext } from "./form-context"
import { type FormValues, formDataToObject, groupIssues } from "./form-data"

/** User-facing strings shared by both {@link Form} variants. */
export interface FormLabels {
  /** Accessible name for the form-level error region shown for cross-field validation messages. */
  readonly formError: string
}

/** English defaults for {@link FormLabels}. */
export const defaultFormLabels: FormLabels = {
  formError: "Form error",
}

/** Props common to both {@link Form} variants. */
interface FormBaseProps {
  /** Overrides for any subset of the user-facing strings. */
  readonly labels?: Partial<FormLabels>
  readonly children: ReactNode
  readonly className?: string
  readonly ref?: Ref<HTMLFormElement>
}

/** {@link Form} props when a schema is given — `onSubmit` receives the schema's validated output. */
export interface SchemaFormProps<Output> extends FormBaseProps {
  /** A Standard Schema (Zod, Valibot, ArkType, …) validating the decoded form values. */
  readonly schema: StandardSchemaV1<unknown, Output>
  /**
   * Called with the validated value once submission passes validation. May be async; the form stays
   * `pending` (disabling fields and the submit button) until it settles.
   */
  readonly onSubmit: (value: Output) => void | Promise<void>
}

/** {@link Form} props when no schema is given — `onSubmit` receives the raw {@link FormValues}. */
export interface SchemalessFormProps extends FormBaseProps {
  readonly schema?: undefined
  /** Called with the raw decoded values; the form performs no validation. May be async. */
  readonly onSubmit: (value: FormValues) => void | Promise<void>
}

/**
 * Props for {@link Form}. Two variants keep `onSubmit` sound: with a `schema`, `Output` is inferred
 * and passed validated; without one, `onSubmit` receives {@link FormValues}. A caller cannot name a
 * narrowed `Output` without supplying a matching schema.
 */
export type FormProps<Output = FormValues> = SchemaFormProps<Output> | SchemalessFormProps

/**
 * A schema-validated form built on React 19 Actions. Submission is handled inside a transition (not
 * the native `action` reset path): the native `FormData` is decoded to plain values, validated
 * against `schema`, and — only when valid — handed to `onSubmit`. Validation issues are grouped by
 * field `name` and exposed through context so each `Field` renders its own message; issues without
 * a path surface in a form-level alert. Because submission never routes through React's automatic
 * form reset, a validation failure keeps every entered value instead of clearing the form.
 * Record and field values stay caller-controlled (uncontrolled inputs submit through `FormData`);
 * the form owns only its per-submission validation errors, and no module-level state, so two forms
 * never share validation.
 */
export function Form<Output = FormValues>(props: FormProps<Output>): ReactElement {
  const { labels: labelOverrides, children, className, ref } = props
  const labels = { ...defaultFormLabels, ...labelOverrides }

  const [errors, setErrors] = useState<FieldErrors>({})
  const [pending, startTransition] = useTransition()

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    // Own the submission instead of passing `action` to the form: React resets an uncontrolled form
    // after a function-valued `action` settles, so returning validation errors would wipe the
    // user's input. `preventDefault` + a transition keeps the entered values; the transition's
    // pending flows through `FormContext` so `FormSubmit` and fields stay pending-aware.
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const values = formDataToObject(formData)
      if (props.schema === undefined) {
        await props.onSubmit(values)
        setErrors({})
        return
      }
      const result = await validateWithSchema(props.schema, values)
      if (result.ok) {
        await props.onSubmit(result.value)
        setErrors({})
        return
      }
      setErrors(groupIssues(result.error))
    })
  }

  const formErrors = errors[FORM_ERROR_KEY] ?? []

  return (
    <FormContext value={{ errors, pending }}>
      <form
        ref={ref}
        onSubmit={handleSubmit}
        noValidate
        className={cn("flex flex-col gap-6", className)}
      >
        {formErrors.length === 0 ? null : (
          <section aria-label={labels.formError}>
            <FieldError errors={formErrors.map((message) => ({ message }))} />
          </section>
        )}
        {children}
      </form>
    </FormContext>
  )
}
