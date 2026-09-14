import {
  type FilterOperator,
  type FilterValue,
  isListOperator,
  isPresenceOperator,
  type ListFilter,
} from "@plainworks/std"

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

// Coerce one editor string to the neutral scalar the list contract compares against: a finite
// number for a numeric field, the raw string otherwise. An empty or non-numeric entry stays a
// string so the filter still round-trips through the editor.
function coerceScalar(raw: string, type: FilterFieldType | undefined): FilterValue {
  if (type === "number" && raw.trim() !== "") {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return raw
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
    const value = parseListValues(raw).map((part) => coerceScalar(part, def.type))
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
