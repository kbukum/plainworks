"use client"

import { Input } from "@plainworks/elements/input"
import { Label } from "@plainworks/elements/label"
import { type ReactElement, useId } from "react"

/**
 * Props for {@link ListSearch}. Controlled: the surface owns the term and resets the page on
 * change.
 */
export interface ListSearchProps {
  /** The current search term. */
  readonly value: string
  /** Called with the next term on each edit. */
  readonly onChange: (next: string) => void
  /** The visible field label (e.g. "Search orders"). */
  readonly label: string
  /** Placeholder copy. */
  readonly placeholder?: string
}

/**
 * The shared free-text search control every catalog surface reuses — a labelled search input over
 * the `elements` atom. Controlled so the term keys the list query directly; the surface applies the
 * page-reset on change through {@link useCatalogList}.
 */
export function ListSearch({ value, onChange, label, placeholder }: ListSearchProps): ReactElement {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="search"
        className="max-w-sm"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
