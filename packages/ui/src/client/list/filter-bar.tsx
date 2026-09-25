"use client"

import { Button } from "@plainworks/elements/button"
import { Input } from "@plainworks/elements/input"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { Textarea } from "@plainworks/elements/textarea"
import {
  type FilterOperator,
  type FilterValue,
  isListOperator,
  isPresenceOperator,
  type ListFilter,
} from "@plainworks/std"
import { cn } from "@plainworks/theme"
import { type ReactElement, useEffect, useRef, useState } from "react"
import {
  buildFilter,
  encodeListValues,
  type FilterFieldDef,
  filterToInputValue,
  operatorsForField,
  parseListValues,
} from "./filter-model"

/** User-facing strings for {@link FilterBar}; every field defaults through {@link defaultFilterBarLabels}. */
export interface FilterBarLabels {
  /** Accessible name for the whole filter group. */
  readonly title: string
  /** Accessible name for one filter row, taking its 1-based position. */
  readonly filterRow: (position: number) => string
  /** Accessible name for a row's field picker. */
  readonly field: string
  /** Accessible name for a row's operator picker. */
  readonly operator: string
  /** Accessible name for a row's value editor. */
  readonly value: string
  /** Label for the add-filter button. */
  readonly addFilter: string
  /** Accessible name for a row's remove button, taking its 1-based position. */
  readonly removeFilter: (position: number) => string
  /** Politely announced summary of how many filters apply, taking the count. */
  readonly applied: (count: number) => string
  /** Label for the button that removes every filter. */
  readonly clearAll: string
  /** Display label per operator, shown in the operator picker. */
  readonly operators: Readonly<Record<FilterOperator, string>>
}

/**
 * A subset override of {@link FilterBarLabels}. The nested `operators` map is itself partial, so a
 * caller can relabel a single operator without restating every one.
 */
export type FilterBarLabelOverrides = Partial<Omit<FilterBarLabels, "operators">> & {
  readonly operators?: Partial<Record<FilterOperator, string>>
}

/** English defaults for every {@link FilterBarLabels} field. */
export const defaultFilterBarLabels: FilterBarLabels = {
  title: "Filters",
  filterRow: (position: number) => `Filter ${position}`,
  field: "Field",
  operator: "Operator",
  value: "Value",
  addFilter: "Add filter",
  removeFilter: (position: number) => `Remove filter ${position}`,
  applied: (count: number) =>
    count === 0 ? "No filters applied" : `${count} ${count === 1 ? "filter" : "filters"} applied`,
  clearAll: "Clear all filters",
  operators: {
    eq: "Equals",
    neq: "Not equals",
    gt: "Greater than",
    gte: "Greater or equal",
    lt: "Less than",
    lte: "Less or equal",
    like: "Contains",
    ilike: "Contains (any case)",
    in: "In",
    nin: "Not in",
    null: "Is empty",
    notNull: "Is not empty",
  },
}

/** Props for {@link FilterBar}. Controlled: `value` is the emitted `std/list` filter set. */
export interface FilterBarProps {
  /** The fields a user can filter on, in picker order. Must be non-empty. */
  readonly fields: readonly FilterFieldDef[]
  /** The current filter set (the `std/list` `ListFilter[]`). */
  readonly value: readonly ListFilter[]
  /** Called with the next filter set on any add, edit, or removal. */
  readonly onChange: (filters: readonly ListFilter[]) => void
  /** Overrides for any subset of the user-facing strings. */
  readonly labels?: FilterBarLabelOverrides
  readonly className?: string
}

/** A requested controlled transition and where focus goes once the parent accepts it. */
interface PendingFocus {
  readonly previous: readonly ListFilter[]
  readonly expected: readonly ListFilter[]
  readonly target: number | "add" | "bar"
}

/**
 * A controlled filter builder that emits the neutral `std/list` `ListFilter[]`. Each row picks a
 * field, an operator (constrained to what the field allows), and — unless the operator is a
 * presence check — a value, coerced to the correct discriminated filter shape. It reuses the
 * elements inputs downward. The emitted filter set is fully controlled: every edit derives from
 * `value` and reports the next set through `onChange`, so the same filter set keys a `std/list`
 * query and this UI. The only local state is a multi-line list editor's in-progress text buffer,
 * which resyncs whenever `value` changes from outside. A filter whose field is absent from `fields`
 * (a stale saved view) is preserved and shown as its own picker option rather than silently
 * rewritten to another field.
 *
 * Rows adapt to the bar's own width (a `filter-bar` container), stacking controls full-width when
 * narrow. A polite status announces how many filters apply. Focus never falls to the page: adding
 * a row focuses its field picker, removing one focuses the next row (else the previous, else the
 * add button), and clearing all returns to the add button.
 */
export function FilterBar({
  fields,
  value,
  onChange,
  labels: labelOverrides,
  className,
}: FilterBarProps): ReactElement {
  const labels: FilterBarLabels = {
    ...defaultFilterBarLabels,
    ...labelOverrides,
    operators: { ...defaultFilterBarLabels.operators, ...labelOverrides?.operators },
  }

  // Stable per-row identity so a row's local editor draft (see `ListValueEditor`) stays bound to
  // its logical filter across a removal or reorder. Keying by array index would reuse a removed
  // row's editor instance for the next row, leaking a stale draft. Our own edits keep a row's id; a
  // length change from outside (a loaded/reset `value`) reissues ids so rows realign 1:1.
  const nextRowId = useRef(0)
  const [rowIds, setRowIds] = useState<readonly number[]>(() =>
    value.map(() => nextRowId.current++),
  )
  if (rowIds.length !== value.length) {
    setRowIds(value.map(() => nextRowId.current++))
  }

  // A focus request waits for the exact transition it requested. A parent can commit later, reject
  // it, or replace it with another controlled value; only the accepted transition moves focus.
  const fieldPickers = useRef(new Map<number, HTMLSelectElement>())
  const addButton = useRef<HTMLButtonElement>(null)
  const bar = useRef<HTMLFieldSetElement>(null)
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null)
  useEffect(() => {
    if (pendingFocus === null) return
    if (!filterSetsEqual(value, pendingFocus.expected)) {
      if (!filterSetsEqual(value, pendingFocus.previous)) setPendingFocus(null)
      return
    }
    const { target: requestedTarget } = pendingFocus
    let target: HTMLElement | null | undefined =
      requestedTarget === "bar" ? bar.current : addButton.current
    if (typeof requestedTarget === "number") {
      const rowId = rowIds[requestedTarget]
      target = rowId === undefined ? undefined : fieldPickers.current.get(rowId)
    }
    if (target === null || target === undefined) return
    target.focus()
    setPendingFocus(null)
  }, [pendingFocus, value, rowIds])

  const firstField = fields[0]

  // Preserve an unrecognized field instead of aliasing it to `firstField`: a synthetic def keeps
  // the row's own `field` (as a plain text editor) so an edit never rewrites it to another column.
  const findDef = (field: string): FilterFieldDef =>
    fields.find((candidate) => candidate.field === field) ?? { field, label: field }

  const replaceAt = (index: number, filter: ListFilter): void => {
    onChange(value.map((existing, position) => (position === index ? filter : existing)))
  }

  const changeField = (index: number, field: string): void => {
    const previous = value[index]
    if (previous === undefined) return
    const def = findDef(field)
    const operators = operatorsForField(def)
    const op = operators.includes(previous.op) ? previous.op : operators[0]
    replaceAt(index, buildFilter(def, op, carryValue(previous, op)))
  }

  const changeOperator = (index: number, op: FilterOperator): void => {
    const filter = value[index]
    if (filter === undefined) return
    replaceAt(index, buildFilter(findDef(filter.field), op, carryValue(filter, op)))
  }

  const changeValue = (index: number, raw: string): void => {
    const filter = value[index]
    if (filter === undefined) return
    replaceAt(index, buildFilter(findDef(filter.field), filter.op, raw))
  }

  const addFilter = (): void => {
    if (firstField === undefined) return
    const op = operatorsForField(firstField)[0]
    const id = nextRowId.current++
    const expected = [...value, buildFilter(firstField, op, "")]
    onChange(expected)
    setRowIds([...rowIds, id])
    setPendingFocus({ previous: value, expected, target: value.length })
  }

  const removeFilter = (index: number): void => {
    const expected = value.filter((_, position) => position !== index)
    onChange(expected)
    setRowIds(rowIds.filter((_, position) => position !== index))
    // The next row slides into `index`; the last row falls back to the previous one.
    const remaining = expected.length
    setPendingFocus({
      previous: value,
      expected,
      target:
        remaining === 0
          ? firstField === undefined
            ? "bar"
            : "add"
          : Math.min(index, remaining - 1),
    })
  }

  const clearAll = (): void => {
    const expected: readonly ListFilter[] = []
    onChange(expected)
    setRowIds([])
    setPendingFocus({
      previous: value,
      expected,
      target: firstField === undefined ? "bar" : "add",
    })
  }

  return (
    <fieldset
      ref={bar}
      aria-label={labels.title}
      tabIndex={firstField === undefined ? -1 : undefined}
      className={cn(
        "@container/filter-bar flex min-w-0 flex-col gap-3 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {value.map((filter, index) => {
        const def = findDef(filter.field)
        const operators = withOperator(operatorsForField(def), filter.op)
        const fieldChoices = withField(fields, filter.field)
        const position = index + 1
        const rowId = rowIds[index]
        return (
          <fieldset
            key={rowId}
            aria-label={labels.filterRow(position)}
            className="flex min-w-0 flex-wrap items-start gap-2"
          >
            <NativeSelect
              ref={(element: HTMLSelectElement | null) => {
                if (rowId === undefined) return
                if (element === null) fieldPickers.current.delete(rowId)
                else fieldPickers.current.set(rowId, element)
              }}
              className={CONTROL_CLASS}
              aria-label={labels.field}
              value={filter.field}
              onChange={(event) => changeField(index, event.target.value)}
            >
              {fieldChoices.map((candidate) => (
                <NativeSelectOption key={candidate.field} value={candidate.field}>
                  {candidate.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              className={CONTROL_CLASS}
              aria-label={labels.operator}
              value={filter.op}
              onChange={(event) => changeOperator(index, event.target.value as FilterOperator)}
            >
              {operators.map((op) => (
                <NativeSelectOption key={op} value={op}>
                  {labels.operators[op]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {isPresenceOperator(filter.op)
              ? null
              : renderValueEditor({
                  def,
                  filter,
                  label: labels.value,
                  onValueChange: (raw) => changeValue(index, raw),
                })}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.removeFilter(position)}
              onClick={() => removeFilter(index)}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </fieldset>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        {firstField === undefined ? null : (
          <Button ref={addButton} type="button" variant="outline" size="sm" onClick={addFilter}>
            {labels.addFilter}
          </Button>
        )}
        {value.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
            {labels.clearAll}
          </Button>
        ) : null}
        <p role="status" className="text-caption text-muted-foreground">
          {labels.applied(value.length)}
        </p>
      </div>
    </fieldset>
  )
}

// Full-width when the bar is narrow so controls stack instead of overflowing; natural width once
// the bar itself has room.
const CONTROL_CLASS = "w-full @md/filter-bar:w-auto"
const VALUE_EDITOR_CLASS = "w-full @md/filter-bar:w-40"

// Carry a row's editor value across an operator-category change instead of feeding a list editor's
// multi-line serialization to a scalar builder (which would emit `eq: "a\nb"` from `["a","b"]`).
// A target presence operator takes no value; switching a list operator to a scalar keeps only the
// first value; every other transition carries the current value through unchanged.
function carryValue(filter: ListFilter, targetOp: FilterOperator): string {
  if (isPresenceOperator(targetOp)) return ""
  if (isListOperator(filter.op) && !isListOperator(targetOp)) {
    return parseListValues(filterToInputValue(filter))[0] ?? ""
  }
  return filterToInputValue(filter)
}

// Ensure the row's current field is a selectable option even when it is absent from `fields`, so an
// unrecognized field stays visible and editable rather than snapping to the first defined field.
function withField(fields: readonly FilterFieldDef[], field: string): readonly FilterFieldDef[] {
  if (fields.some((candidate) => candidate.field === field)) return fields
  return [{ field, label: field }, ...fields]
}

// Ensure the row's current operator is a selectable option even when the field's allowed set does
// not include it (e.g. after the field changed), so the operator is never silently dropped.
function withOperator(
  operators: readonly FilterOperator[],
  op: FilterOperator,
): readonly FilterOperator[] {
  return operators.includes(op) ? operators : [op, ...operators]
}

function filterSetsEqual(left: readonly ListFilter[], right: readonly ListFilter[]): boolean {
  return (
    left.length === right.length &&
    left.every((filter, index) => {
      const candidate = right[index]
      if (
        candidate === undefined ||
        filter.field !== candidate.field ||
        filter.op !== candidate.op
      ) {
        return false
      }
      if (!("value" in filter) || !("value" in candidate)) {
        return !("value" in filter) && !("value" in candidate)
      }
      const filterValue = filter.value
      const candidateValue = candidate.value
      if (isFilterValueList(filterValue) || isFilterValueList(candidateValue)) {
        return (
          isFilterValueList(filterValue) &&
          isFilterValueList(candidateValue) &&
          filterValue.length === candidateValue.length &&
          filterValue.every((item, valueIndex) => item === candidateValue[valueIndex])
        )
      }
      return filterValue === candidateValue
    })
  )
}

function isFilterValueList(
  value: FilterValue | readonly FilterValue[],
): value is readonly FilterValue[] {
  return Array.isArray(value)
}

// The value editor for a non-presence operator: a native select for a `select` field on a scalar
// operator, a multi-line editor (one value per line) for a list operator, otherwise a text/number
// input.
function renderValueEditor({
  def,
  filter,
  label,
  onValueChange,
}: {
  readonly def: FilterFieldDef
  readonly filter: ListFilter
  readonly label: string
  readonly onValueChange: (raw: string) => void
}): ReactElement {
  const current = filterToInputValue(filter)
  if (isListOperator(filter.op)) {
    return <ListValueEditor filter={filter} label={label} onValueChange={onValueChange} />
  }
  if (def.type === "select") {
    return (
      <NativeSelect
        className={CONTROL_CLASS}
        aria-label={label}
        value={current}
        onChange={(event) => onValueChange(event.target.value)}
      >
        {def.options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    )
  }
  // A text-backed numeric draft, not a native `type="number"`: a native number input blanks an
  // out-of-range or non-numeric draft, so the visible editor could disagree with the emitted filter
  // value. A text input keeps display and emitted string identical while `buildFilter` coerces to a
  // finite number at the wire boundary; `inputMode` still summons a numeric keypad on touch.
  return (
    <Input
      aria-label={label}
      type="text"
      inputMode={def.type === "number" ? "decimal" : undefined}
      className={cn("h-8", VALUE_EDITOR_CLASS)}
      value={current}
      onChange={(event) => onValueChange(event.target.value)}
    />
  )
}

// The multi-line value editor for a list operator (`in`/`nin`): one value per line, so a value
// containing a comma survives (unlike a single-delimiter split). It keeps a raw text buffer so an
// in-progress space or blank line is not reformatted away on each keystroke; the parsed values are
// emitted upward, and the buffer resyncs only when the underlying filter changes from outside.
function ListValueEditor({
  filter,
  label,
  onValueChange,
}: {
  readonly filter: ListFilter
  readonly label: string
  readonly onValueChange: (raw: string) => void
}): ReactElement {
  const external = filterToInputValue(filter)
  const [text, setText] = useState(external)
  const [syncedExternal, setSyncedExternal] = useState(external)
  if (external !== syncedExternal) {
    setSyncedExternal(external)
    setText(external)
  }
  return (
    <Textarea
      aria-label={label}
      rows={2}
      className={cn("h-auto min-h-16 py-1.5", VALUE_EDITOR_CLASS)}
      value={text}
      onChange={(event) => {
        const raw = event.target.value
        setText(raw)
        // The value the parent echoes back once it re-encodes the parsed values — tracked so a
        // genuine external change resyncs the buffer while our own edit does not.
        setSyncedExternal(encodeListValues(parseListValues(raw)))
        onValueChange(raw)
      }}
    />
  )
}
