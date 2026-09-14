"use client"

import type { ReactElement } from "react"

/** Props for {@link NumberValue}. */
export interface NumberValueProps {
  /** The number to format. */
  readonly value: number
  /**
   * BCP-47 locale, e.g. `"en-US"`. Required and explicit so a server render and the client
   * hydration format identically — never the ambient runtime locale.
   */
  readonly locale: string
  /** `Intl.NumberFormat` options — e.g. `{ style: "currency", currency: "USD" }`. */
  readonly options?: Intl.NumberFormatOptions
  readonly className?: string
}

/**
 * Render a number with `Intl.NumberFormat`. `locale` is explicit so SSR and client agree; currency,
 * percent, and unit formatting come from the injected `options` rather than string concatenation.
 */
export function NumberValue({ value, locale, options, className }: NumberValueProps): ReactElement {
  const formatter = new Intl.NumberFormat(locale, options)
  return (
    <span data-slot="number-value" className={className}>
      {formatter.format(value)}
    </span>
  )
}
