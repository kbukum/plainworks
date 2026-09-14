"use client"

import type { ReactElement } from "react"

/** A value a {@link DateValue} can format. Strings must be an ISO 8601 date-time instant. */
export type DateInput = Date | number | string

/** Props for {@link DateValue}. */
export interface DateValueProps {
  /** The instant to format — a `Date`, epoch milliseconds, or an ISO 8601 date string. */
  readonly value: DateInput
  /**
   * BCP-47 locale, e.g. `"en-US"`. Required and explicit so a server render and the client
   * hydration format identically — never the ambient runtime locale.
   */
  readonly locale: string
  /** IANA time zone, e.g. `"UTC"`. Required and explicit for the same SSR-stability reason. */
  readonly timeZone: string
  /**
   * `Intl.DateTimeFormat` options. Defaults to a medium date. `timeZone` is excluded — it is set
   * from the required {@link DateValueProps.timeZone} prop so SSR/client stability is never lost.
   */
  readonly options?: Omit<Intl.DateTimeFormatOptions, "timeZone">
  readonly className?: string
}

// Standardized ECMAScript Date Time String Format (ISO 8601).
const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}(?::?\d{2})?)?)?$/

function toDate(value: DateInput): Date {
  if (value instanceof Date) return value
  if (typeof value === "number") return new Date(value)
  if (typeof value === "string" && ISO_8601_PATTERN.test(value)) {
    return new Date(value)
  }
  return new Date(Number.NaN)
}

/**
 * Render an instant with `Intl.DateTimeFormat` inside a semantic `<time>` whose `dateTime` carries
 * the machine-readable ISO value. `locale` and `timeZone` are explicit so SSR and client agree; an
 * unparseable value renders empty rather than the string `"Invalid Date"`.
 */
export function DateValue({
  value,
  locale,
  timeZone,
  options,
  className,
}: DateValueProps): ReactElement {
  const date = toDate(value)
  const invalid = Number.isNaN(date.getTime())
  const formatOptions: Intl.DateTimeFormatOptions =
    options === undefined ? { dateStyle: "medium" } : { ...options }
  const formatter = new Intl.DateTimeFormat(locale, { ...formatOptions, timeZone })
  return (
    <time
      data-slot="date-value"
      dateTime={invalid ? undefined : date.toISOString()}
      className={className}
    >
      {invalid ? "" : formatter.format(date)}
    </time>
  )
}
