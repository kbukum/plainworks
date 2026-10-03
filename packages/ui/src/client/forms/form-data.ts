"use client"

import type { StandardSchemaIssue } from "@plainworks/std/seam"
import { type FieldErrors, FORM_ERROR_KEY } from "./form-context"

/** The plain, serializable value a form field contributes — a single string or a repeated set. */
export type FormFieldValue = string | readonly string[]

/** The decoded, untrusted form payload passed to a schema (or to `onSubmit` when schema-less). */
export type FormValues = Readonly<Record<string, FormFieldValue>>

/**
 * Collapse a native `FormData` into a plain object at the validation boundary: repeated names (a
 * multi-select, a checkbox group) become a string array, a single name stays a string, and `File`
 * entries are dropped — this concern submits scalar field values, not uploads. Field names are
 * untrusted, so the record is built with `Object.fromEntries`: a control named `__proto__` becomes
 * an own field rather than mutating the result's prototype. The result is the untrusted `unknown` a
 * Standard Schema validates and coerces.
 */
export function formDataToObject(formData: FormData): FormValues {
  const grouped = new Map<string, string[]>()
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue
    const existing = grouped.get(key)
    if (existing === undefined) {
      grouped.set(key, [value])
    } else {
      existing.push(value)
    }
  }
  return Object.fromEntries(
    [...grouped].map(([key, values]): [string, FormFieldValue] => {
      const [first] = values
      return [key, values.length === 1 && first !== undefined ? first : values]
    }),
  )
}

// Keep nested and repeated paths intact; a path-less issue belongs to the form summary.
function issueFieldName(issue: StandardSchemaIssue): string {
  if (issue.path === undefined || issue.path.length === 0) return FORM_ERROR_KEY
  return issue.path.reduce<string>((name, part) => {
    const key = typeof part === "object" ? part.key : part
    return typeof key === "number"
      ? `${name}[${key}]`
      : `${name}${name === "" ? "" : "."}${String(key)}`
  }, "")
}

/**
 * Group Standard Schema issues into {@link FieldErrors} keyed by field `name`, deduping repeated
 * messages per field and preserving first-seen order. Issues without a path collect under the
 * form-level key so a cross-field rule still surfaces.
 */
export function groupIssues(issues: ReadonlyArray<StandardSchemaIssue>): FieldErrors {
  const byField = new Map<string, string[]>()
  for (const issue of issues) {
    const name = issueFieldName(issue)
    const messages = byField.get(name) ?? []
    if (!messages.includes(issue.message)) {
      messages.push(issue.message)
    }
    byField.set(name, messages)
  }
  return Object.fromEntries(byField)
}
