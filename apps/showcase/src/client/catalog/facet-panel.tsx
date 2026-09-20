"use client"

import { Checkbox } from "@plainworks/elements/checkbox"
import type { Facets, ListFilter } from "@plainworks/std"
import type { ReactElement } from "react"

/** One selectable value within a facet field — its wire value and its human label. */
export interface FacetOption {
  readonly value: string
  readonly label: string
}

/**
 * One faceted field: the backend field, its heading, and the full option vocabulary in display
 * order.
 */
export interface FacetFieldDef {
  /** The entity field the facet filters on (e.g. `role`, `status`, `category`). */
  readonly field: string
  /** The group heading. */
  readonly label: string
  /** Every selectable value, shown in this order with its live count. */
  readonly options: readonly FacetOption[]
}

/** Props for {@link FacetPanel}. Controlled: `value` is the emitted `std/list` filter set. */
export interface FacetPanelProps {
  /** The facet fields to render, in order. */
  readonly fields: readonly FacetFieldDef[]
  /**
   * The response's facet counts (cross-filtered by the backend), or `undefined` before the first
   * read.
   */
  readonly facets: Facets | undefined
  /** The current filter set. */
  readonly value: readonly ListFilter[]
  /** Called with the next filter set whenever a value is toggled. */
  readonly onChange: (next: readonly ListFilter[]) => void
  /** Accessible name for the whole panel. Defaults to "Filters". */
  readonly label?: string
}

/**
 * The values currently selected for `field` — the `in` filter's array, or empty when unfiltered.
 */
function selectedValues(filters: readonly ListFilter[], field: string): readonly string[] {
  const filter = filters.find((candidate) => candidate.field === field && candidate.op === "in")
  if (filter === undefined || !("value" in filter) || !Array.isArray(filter.value)) {
    return []
  }
  return filter.value.map((v) => String(v))
}

/**
 * A controlled faceted filter panel that emits the neutral `std/list` `ListFilter[]`. Each field is
 * a labelled group of toggles, one per value, showing the live count the backend computed with the
 * *other* facets applied — so a count previews "what would I get if I also picked this". Selecting
 * values for a field emits a single `in` filter; clearing them drops the filter entirely.
 * It renders every configured option (even at count zero) so the choices stay stable as the data
 * narrows, composing the `elements` checkbox atom rather than reinventing a control.
 */
export function FacetPanel({
  fields,
  facets,
  value,
  onChange,
  label = "Filters",
}: FacetPanelProps): ReactElement {
  const toggle = (field: string, optionValue: string, on: boolean): void => {
    const current = selectedValues(value, field)
    const next = on
      ? [...current, optionValue]
      : current.filter((existing) => existing !== optionValue)
    const withoutField = value.filter((filter) => filter.field !== field)
    onChange(next.length > 0 ? [...withoutField, { field, op: "in", value: next }] : withoutField)
  }

  return (
    <div className="@container/facets">
      <section aria-label={label} className="grid gap-5 @sm/facets:grid-cols-2">
        {fields.map((field) => {
          const counts = facets?.[field.field] ?? {}
          const selected = selectedValues(value, field.field)
          return (
            <fieldset key={field.field} className="grid min-w-0 content-start gap-2">
              <legend className="mb-1 font-medium text-sm">{field.label}</legend>
              {field.options.map((option) => {
                const checked = selected.includes(option.value)
                const count = counts[option.value] ?? 0
                return (
                  <div
                    key={option.value}
                    className="flex min-w-0 items-center gap-2 text-sm leading-6 has-[:disabled]:opacity-60"
                  >
                    <Checkbox
                      aria-label={`${option.label}, ${count}`}
                      checked={checked}
                      onCheckedChange={(next) => toggle(field.field, option.value, next === true)}
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
