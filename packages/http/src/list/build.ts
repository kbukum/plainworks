import type { FilterValue, ListFilter, ListQueryParams } from "@plainworks/std"
import { HttpError } from "../error"
import type { QueryParams, QueryValue } from "../url"
import { escapeListValue, escapeScalarValue } from "./codec"
import { FILTER_OPERATOR_TOKENS } from "./operators"

/**
 * Control-parameter names {@link buildListQuery} owns. A filter may not target one of these: its
 * `field=op.value` token would be silently overwritten by the control assignment of the same key
 * (e.g. a filter on `page` clobbered by the `page` number), so it is rejected as a caller fault.
 */
const RESERVED_FIELDS: ReadonlySet<string> = new Set([
  "page",
  "pageSize",
  "cursor",
  "sortBy",
  "order",
  "search",
  "includes",
  "facets",
])

/**
 * Serialize a typed {@link ListQueryParams} into the {@link QueryParams} the `http` client already
 * encodes onto a URL — the PostgREST string the canonical contract specifies (`status=eq.active`,
 * `tags=in.(a,b,c)`, `name=is.null`). A field carrying several filters becomes a repeated key
 * (`price=gte.10&price=lte.20`). A value carrying a delimiter is escaped so it round-trips (see
 * `./codec`). A filter whose `value` shape contradicts its operator (a scalar for `in`, an array
 * for `eq`, a value on `null`) is a caller fault rejected as a fatal `http/request` error rather
 * than silently mis-serialized. A filter whose `field` is a reserved control name
 * ({@link RESERVED_FIELDS}) is rejected for the same reason. Reuses `http` entirely — the returned
 * params flow through URL safety, the credential guard, auth injection, timeout, retry, and the
 * codec unchanged. The list contract it serializes is defined in `@plainworks/std`.
 */
export function buildListQuery(params: ListQueryParams): QueryParams {
  if (params.page !== undefined && params.cursor !== undefined) {
    throw HttpError.request(
      "Offset (`page`) and cursor pagination are mutually exclusive — supply one, not both.",
    )
  }
  const result: Record<string, QueryValue | QueryValue[]> = Object.create(null) as Record<
    string,
    QueryValue | QueryValue[]
  >

  for (const filter of params.filters ?? []) {
    appendFilter(result, filter)
  }
  assignScalar(result, "page", params.page)
  assignScalar(result, "pageSize", params.pageSize)
  assignScalar(result, "cursor", params.cursor)
  assignScalar(result, "sortBy", params.sortBy)
  assignScalar(result, "order", params.order)
  assignScalar(result, "search", params.search)
  assignList(result, "includes", params.includes)
  assignList(result, "facets", params.facets)

  return result
}

/** Serialize one filter into its `field=token` form and merge it, repeating the key when the field recurs. */
function appendFilter(target: Record<string, QueryValue | QueryValue[]>, filter: ListFilter): void {
  if (RESERVED_FIELDS.has(filter.field)) {
    throw HttpError.request(
      `The filter field '${filter.field}' collides with a reserved list-control parameter.`,
    )
  }
  const token = serializeFilter(filter)
  const existing = Object.getOwnPropertyDescriptor(target, filter.field)?.value as
    | QueryValue
    | QueryValue[]
    | undefined
  if (existing === undefined) {
    target[filter.field] = token
  } else if (Array.isArray(existing)) {
    existing.push(token)
  } else {
    target[filter.field] = [existing, token]
  }
}

/** Build the `<op>.<value>` token, validating the operator and the value shape against it. */
function serializeFilter(filter: ListFilter): string {
  const prefix = FILTER_OPERATOR_TOKENS[filter.op]
  if (prefix === undefined) {
    throw HttpError.request(`Unknown filter operator '${String(filter.op)}' on '${filter.field}'.`)
  }
  if (filter.op === "null" || filter.op === "notNull") {
    if ("value" in filter && filter.value !== undefined) {
      throw HttpError.request(`The '${filter.op}' filter on '${filter.field}' takes no value.`)
    }
    return prefix
  }
  if (filter.op === "in" || filter.op === "nin") {
    if (!Array.isArray(filter.value)) {
      throw HttpError.request(
        `The '${filter.op}' filter on '${filter.field}' requires an array value.`,
      )
    }
    // An empty item cannot round-trip: `[]` and `[""]` would share the `in.()` wire form, so the
    // request is rejected here with field context (the codec's escapeListValue enforces the same
    // rule at its own boundary).
    if (filter.value.some((v) => String(v) === "")) {
      throw HttpError.request(
        `The '${filter.op}' filter on '${filter.field}' cannot contain an empty-string value.`,
      )
    }
    return `${prefix}.(${filter.value.map((v) => escapeListValue(String(v))).join(",")})`
  }
  // Scalar operators: the discriminated union guarantees `filter` is a ScalarFilter here.
  const scalar = filter as { value: FilterValue }
  if (scalar.value === undefined || Array.isArray(scalar.value)) {
    throw HttpError.request(
      `The '${filter.op}' filter on '${filter.field}' requires a scalar value.`,
    )
  }
  return `${prefix}.${escapeScalarValue(String(scalar.value))}`
}

/** Set a scalar param when present; `undefined` is simply omitted (never an empty parameter). */
function assignScalar(
  target: Record<string, QueryValue | QueryValue[]>,
  key: string,
  value: QueryValue | undefined,
): void {
  if (value !== undefined) {
    target[key] = value
  }
}

/** Set a list param as a comma-joined value when non-empty; an empty or absent list is omitted. */
function assignList(
  target: Record<string, QueryValue | QueryValue[]>,
  key: string,
  value: readonly string[] | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    target[key] = value.join(",")
  }
}
