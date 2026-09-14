"use client"

import { Button } from "@plainworks/elements/button"
import { Input } from "@plainworks/elements/input"
import { NativeSelect, NativeSelectOption } from "@plainworks/elements/native-select"
import { Textarea } from "@plainworks/elements/textarea"
import {
  type FilterOperator,
  isListOperator,
  isPresenceOperator,
  type ListFilter,
} from "@plainworks/std"
import { cn } from "@plainworks/theme"
import { type ReactElement, useRef, useState } from "react"
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

  const firstField = fields[0]
  if (firstField === undefined) {
    return <fieldset aria-label={labels.title} className={cn("flex flex-col gap-3", className)} />
  }

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
    const op = operatorsForField(firstField)[0]
    onChange([...value, buildFilter(firstField, op, "")])
    setRowIds([...rowIds, nextRowId.current++])
  }

  const removeFilter = (index: number): void => {
    onChange(value.filter((_, position) => position !== index))
    setRowIds(rowIds.filter((_, position) => position !== index))
  }

  return (
    <fieldset aria-label={labels.title} className={cn("flex flex-col gap-3", className)}>
      {value.map((filter, index) => {
        const def = findDef(filter.field)
        const operators = withOperator(operatorsForField(def), filter.op)
        const fieldChoices = withField(fields, filter.field)
        const position = index + 1
        return (
          <fieldset
            key={rowIds[index]}
            aria-label={labels.filterRow(position)}
            className="flex flex-wrap items-start gap-2"
          >
            <NativeSelect
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
              size="sm"
              aria-label={labels.removeFilter(position)}
              onClick={() => removeFilter(index)}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </fieldset>
        )
      })}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={addFilter}>
          {labels.addFilter}
        </Button>
      </div>
    </fieldset>
  )
}

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
      className="h-8 w-40"
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
      className="h-auto min-h-16 w-40 py-1.5"
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
