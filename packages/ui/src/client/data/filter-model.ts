import {
  type FilterOperator,
  type FilterValue,
  isListOperator,
  isPresenceOperator,
  type ListFilter,
} from "@plainworks/std/list"

/** The editor a filter field renders for its value, which also drives value coercion. */
export type FilterFieldType = "text" | "number" | "select"

/** One selectable value for a `select`-typed filter field. */
export interface FilterFieldOption {
  readonly value: string
  readonly label: string
}

/** Fields common to every filter field definition, regardless of editor type. */
interface FilterFieldBase {
  /** The `field` written onto the emitted {@link ListFilter}. */
  readonly field: string
  /** Human-readable label shown in the field picker. */
  readonly label: string
  /** Allowed operators; defaults to a sensible set for the field's `type`. At least one required. */
  readonly operators?: readonly [FilterOperator, ...FilterOperator[]]
}

/** A free-text filter field — the default when `type` is omitted. */
export interface TextFilterFieldDef extends FilterFieldBase {
  readonly type?: "text"
}

/** A numeric filter field whose value coerces to a finite number. */
export interface NumberFilterFieldDef extends FilterFieldBase {
  readonly type: "number"
}

/** A single-select filter field. Requires at least one option so the editor is never empty. */
export interface SelectFilterFieldDef extends FilterFieldBase {
  readonly type: "select"
  /** Selectable options, in display order; at least one is required. */
  readonly options: readonly [FilterFieldOption, ...FilterFieldOption[]]
}

/**
 * Declares one filterable field: its wire key, its label, its editor, and its allowed operators. A
 * discriminated union on `type` — only a `select` field carries `options` (and must carry at least
 * one), so a text/number field can never smuggle options and a select can never render an empty
 * picker.
 */
export type FilterFieldDef = TextFilterFieldDef | NumberFilterFieldDef | SelectFilterFieldDef

const TEXT_OPERATORS: readonly [FilterOperator, ...FilterOperator[]] = [
  "eq",
  "neq",
  "like",
  "ilike",
  "null",
  "notNull",
]
const NUMBER_OPERATORS: readonly [FilterOperator, ...FilterOperator[]] = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "null",
  "notNull",
]
const SELECT_OPERATORS: readonly [FilterOperator, ...FilterOperator[]] = [
  "eq",
  "neq",
  "in",
  "nin",
  "null",
  "notNull",
]

/** The operators a field allows — its explicit `operators`, or the default set for its `type`. */
export function operatorsForField(
  def: FilterFieldDef,
): readonly [FilterOperator, ...FilterOperator[]] {
  if (def.operators !== undefined) return def.operators
  switch (def.type) {
    case "number":
      return NUMBER_OPERATORS
    case "select":
      return SELECT_OPERATORS
    default:
      return TEXT_OPERATORS
  }
}

// A list operator edits its values one-per-line, so a value carrying a comma (or any other
// character) round-trips unchanged — unlike a single delimiter, which would split `New York, NY`
// into two. Blank lines are dropped and each line is trimmed.
const LIST_VALUE_SEPARATOR = "\n"

/** Render a list operator's values into the multi-line editor text (one value per line). */
export function encodeListValues(values: readonly FilterValue[]): string {
  return values.map((value) => String(value)).join(LIST_VALUE_SEPARATOR)
}

/** Parse the multi-line list editor text back into its values (one per non-blank line). */
export function parseListValues(raw: string): string[] {
  return raw
    .split(LIST_VALUE_SEPARATOR)
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

// Coerce one editor string to the neutral scalar the list contract compares against: the raw
// string for a text field, and a finite number for a numeric one. A numeric field never keeps text
// the number editor cannot show: an empty or non-numeric entry becomes the empty draft `""`.
function coerceScalar(raw: string, type: FilterFieldType | undefined): FilterValue {
  if (type !== "number") return raw
  const parsed = raw.trim() === "" ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : ""
}

// Resolve a `select` field's single value to a real option — a matching option's value, or its
// first option so the emitted scalar filter never carries a value absent from the picker (which
// would render a blank control while silently querying an impossible value).
function coerceSelectScalar(def: FilterFieldDef, raw: string): FilterValue {
  if (def.type === "select") {
    const [firstOption] = def.options
    const match = def.options.find((option) => option.value === raw)
    return match?.value ?? firstOption.value
  }
  return coerceScalar(raw, def.type)
}

/**
 * Build the typed {@link ListFilter} for a field/operator/editor-value triple, choosing the correct
 * discriminated shape: a presence operator drops the value, a list operator parses the multi-line
 * editor into coerced values, and a scalar operator coerces the single value. Operators are
 * narrowed with the `std/list` classification guards, so the shape follows the contract owner. This
 * is the seam that turns the filter-bar UI into the neutral `std/list` request a transport later
 * serializes.
 */
export function buildFilter(def: FilterFieldDef, op: FilterOperator, raw: string): ListFilter {
  if (isPresenceOperator(op)) {
    return { field: def.field, op }
  }
  if (isListOperator(op)) {
    const value = parseListValues(raw)
      .map((part) => coerceScalar(part, def.type))
      .filter((part) => part !== "")
    return { field: def.field, op, value }
  }
  return { field: def.field, op, value: coerceSelectScalar(def, raw) }
}

/** Read the editor string that renders an existing {@link ListFilter} back into its value control. */
export function filterToInputValue(filter: ListFilter): string {
  if (!("value" in filter)) return ""
  if (Array.isArray(filter.value)) {
    return encodeListValues(filter.value)
  }
  return String(filter.value)
}

/**
 * The editor value a row carries across an operator change. A presence target takes no value, and
 * a list operator switching to a scalar keeps only its first value, so a scalar builder is never
 * fed the multi-line list text (which would emit `eq: "a\nb"`). Anything else carries through.
 */
export function carryFilterValue(filter: ListFilter, targetOp: FilterOperator): string {
  if (isPresenceOperator(targetOp)) return ""
  if (isListOperator(filter.op) && !isListOperator(targetOp)) {
    return parseListValues(filterToInputValue(filter))[0] ?? ""
  }
  return filterToInputValue(filter)
}

/**
 * `fields` with `field` first when it isn't defined, so a filter on an unknown field stays visible
 * and editable instead of snapping to the first defined field.
 */
export function withFilterField(
  fields: readonly FilterFieldDef[],
  field: string,
): readonly FilterFieldDef[] {
  if (fields.some((candidate) => candidate.field === field)) return fields
  return [{ field, label: field }, ...fields]
}

/**
 * `operators` with `op` first when the field doesn't allow it (for example after the field
 * changed), so the current operator is never silently dropped.
 */
export function withFilterOperator(
  operators: readonly FilterOperator[],
  op: FilterOperator,
): readonly FilterOperator[] {
  return operators.includes(op) ? operators : [op, ...operators]
}

/** Whether two filter sets hold the same filters, in the same order, with equal values. */
export function filterSetsEqual(
  left: readonly ListFilter[],
  right: readonly ListFilter[],
): boolean {
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

/** The values selected for a facet `field`: its `in` filter's values, or none when unfiltered. */
export function selectedFacetValues(
  filters: readonly ListFilter[],
  field: string,
): readonly string[] {
  const filter = filters.find((candidate) => candidate.field === field && candidate.op === "in")
  if (filter === undefined || !("value" in filter) || !isFilterValueList(filter.value)) return []
  return filter.value.map((value) => String(value))
}

/**
 * `filters` with one facet value of `field` turned on or off. The field keeps a single `in` filter,
 * which is dropped once no value is left; its other filters, such as range bounds, stay.
 */
export function toggleFacetValue(
  filters: readonly ListFilter[],
  field: string,
  value: string,
  on: boolean,
): readonly ListFilter[] {
  const current = selectedFacetValues(filters, field).filter((existing) => existing !== value)
  const next = on ? [...current, value] : current
  const others = filters.filter((filter) => !(filter.field === field && filter.op === "in"))
  return next.length > 0 ? [...others, { field, op: "in", value: next }] : others
}

/** The two operators a numeric range filter writes: its lower and upper bound. */
export type RangeBoundOperator = "gte" | "lte"

/** The numeric bound set for `field` under `op`, or `null` when that side is open. */
export function rangeBound(
  filters: readonly ListFilter[],
  field: string,
  op: RangeBoundOperator,
): number | null {
  const filter = filters.find((candidate) => candidate.field === field && candidate.op === op)
  return filter !== undefined && "value" in filter && typeof filter.value === "number"
    ? filter.value
    : null
}

/** `filters` with the `op` bound of `field` replaced by `value`, or removed when it is `null`. */
export function withRangeBound(
  filters: readonly ListFilter[],
  field: string,
  op: RangeBoundOperator,
  value: number | null,
): readonly ListFilter[] {
  const without = filters.filter((filter) => !(filter.field === field && filter.op === op))
  return value === null ? without : [...without, { field, op, value }]
}
