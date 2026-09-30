"use client"

import { Input } from "@plainworks/elements/input"
import { Label } from "@plainworks/elements/label"
import { type ReactElement, useId } from "react"

/** Every user-facing string of the {@link ListSearch}. */
export interface ListSearchLabels {
  /** The visible field label, e.g. "Search orders". */
  readonly label: string
  readonly placeholder?: string | undefined
}

/** English defaults for every {@link ListSearchLabels} field. */
export const defaultListSearchLabels: ListSearchLabels = { label: "Search" }

/** Props for {@link ListSearch}. Controlled: the list owns the term. */
export interface ListSearchProps {
  readonly value: string
  /** Called with the next term on every edit. */
  readonly onChange: (next: string) => void
  readonly labels?: Partial<ListSearchLabels>
}

/** A labelled free-text search box for a list. Pair it with `useListQueryState().setSearch`. */
export function ListSearch({ value, onChange, labels }: ListSearchProps): ReactElement {
  const copy = { ...defaultListSearchLabels, ...labels }
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{copy.label}</Label>
      <Input
        id={id}
        type="search"
        className="max-w-sm"
        value={value}
        placeholder={copy.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}
