"use client"

import { Checkbox } from "@plainworks/elements/checkbox"
import type { Facets, ListFilter } from "@plainworks/std/list"
import type { ReactElement } from "react"
import { selectedFacetValues, toggleFacetValue } from "./filter-model"

/** One selectable value of a facet: its wire value and its label. */
export interface FacetOption {
  readonly value: string
  readonly label: string
}

/** One faceted field: the field it filters, its heading, and every option in display order. */
export interface FacetField {
  readonly field: string
  readonly label: string
  readonly options: readonly FacetOption[]
}

/** Every user-facing string of the {@link FacetPanel}. */
export interface FacetPanelLabels {
  /** Names the whole panel. */
  readonly region: string
  /** Names one option's checkbox from its label and live count. */
  readonly option: (label: string, count: number) => string
}

/** English defaults for every {@link FacetPanelLabels} field. */
export const defaultFacetPanelLabels: FacetPanelLabels = {
  region: "Filters",
  option: (label, count) => `${label}, ${count}`,
}

/** Props for {@link FacetPanel}. Controlled: `value` is the list's `std/list` filter set. */
export interface FacetPanelProps {
  readonly fields: readonly FacetField[]
  /** The response's facet counts, or `undefined` before the first read. */
  readonly facets: Facets | undefined
  readonly value: readonly ListFilter[]
  readonly onChange: (next: readonly ListFilter[]) => void
  readonly labels?: Partial<FacetPanelLabels>
}

/**
 * A faceted filter panel. Each field is a group of checkboxes with the live count the backend
 * computed with the other facets applied, so a count previews what picking that value adds. Every
 * option shows, even at zero, so the choices stay put as results narrow. A field writes one `in`
 * filter, removed once nothing in it is picked.
 */
export function FacetPanel({
  fields,
  facets,
  value,
  onChange,
  labels,
}: FacetPanelProps): ReactElement {
  const copy = { ...defaultFacetPanelLabels, ...labels }
  return (
    <div className="@container/facets">
      <section aria-label={copy.region} className="grid gap-5 @sm/facets:grid-cols-2">
        {fields.map((field) => {
          const counts = facets?.[field.field] ?? {}
          const selected = selectedFacetValues(value, field.field)
          return (
            <fieldset key={field.field} className="grid min-w-0 content-start gap-2">
              <legend className="mb-1 font-medium text-sm">{field.label}</legend>
              {field.options.map((option) => {
                const count = counts[option.value] ?? 0
                return (
                  <div
                    key={option.value}
                    className="flex min-w-0 items-center gap-2 text-sm leading-6 has-[:disabled]:opacity-60"
                  >
                    <Checkbox
                      aria-label={copy.option(option.label, count)}
                      checked={selected.includes(option.value)}
                      onCheckedChange={(next) =>
                        onChange(toggleFacetValue(value, field.field, option.value, next === true))
                      }
                    />
                    <span aria-hidden="true" className="min-w-0 truncate">
                      {option.label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="ml-auto shrink-0 text-muted-foreground tabular-nums"
                    >
                      {count}
                    </span>
                  </div>
                )
              })}
            </fieldset>
          )
        })}
      </section>
    </div>
  )
}
