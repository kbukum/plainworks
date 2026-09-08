import { HttpError } from "../error"
import type { QueryParams, QueryValue } from "../url"
import { FILTER_OPERATOR_TOKENS } from "./operators"

/** Sort direction for {@link ListQueryParams.sortBy}. */
export type SortDirection = "asc" | "desc"

/** A scalar-comparison filter — `field` compared with `op` against a single value. */
export interface ScalarFilter {
  /** Column/field the filter targets (e.g. `status`, `price`). */
  readonly field: string
  /** A scalar operator. */
  readonly op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike"
  /** The scalar comparison value. A value carrying the escape char (`\`) is escaped on the wire so it round-trips. */
  readonly value: QueryValue
}

/** A list-membership filter — `field` checked against a set of values. */
export interface ListMembershipFilter {
  /** Column/field the filter targets (e.g. `tags`, `role`). */
  readonly field: string
  /** A list operator. */
  readonly op: "in" | "nin"
  /** The values to match against. A value carrying the list delimiter (`,`) or the escape char (`\`) is escaped on the wire so it round-trips. An empty-string value is rejected (it cannot round-trip the wire unambiguously). */
  readonly value: readonly QueryValue[]
}

/** A presence/absence filter — `field` is (or is not) null; takes no value. */
export interface PresenceFilter {
  /** Column/field the filter targets. */
  readonly field: string
  /** A presence operator. */
  readonly op: "null" | "notNull"
}

/**
 * One typed filter — a discriminated union so every operator carries exactly the value shape it needs.
 * A scalar operator carries a single value; a list operator (`in`/`nin`) carries an array; a presence
 * operator (`null`/`notNull`) carries none. TypeScript rejects a mismatched combination at compile
 * time; untyped JavaScript callers get a runtime `http/request` error instead.
 */
export type ListFilter = ScalarFilter | ListMembershipFilter | PresenceFilter

/**
 * The canonical, typed **list-read** request — filter, sort, paginate (offset **or** cursor), free-text
 * search, eager-load, and facet. This one param object is the bridge shared by the `http` wire builder
 * ({@link buildListQuery}) and the `query` cache-key derivation, so the same request keys the cache and
 * hits the backend. Offset (`page`/`pageSize`) suits stable jump-to-page lists; `cursor` suits large or
 * mutating lists and `useInfiniteQuery` (offset drifts as rows change). The two modes are mutually
 * exclusive per request — supplying both `page` and `cursor` is a caller fault rejected by
 * {@link buildListQuery}.
 */
export interface ListQueryParams {
  /** Field filters, `AND`-combined; repeat a field for a range (`price>=10 AND price<=20`). */
  readonly filters?: readonly ListFilter[]
  /** 1-based page number (offset mode). */
  readonly page?: number
  /** Rows per page. */
  readonly pageSize?: number
  /** Opaque cursor for the next/prev page (cursor mode); mutually exclusive with `page` per request. An empty string requests the first page — its presence is what lets a backend select cursor mode from the very first request. */
  readonly cursor?: string
  /** Field to sort by. */
  readonly sortBy?: string
  /** Sort direction; defaults to the server's default when omitted. */
  readonly order?: SortDirection
  /** Free-text search term. */
  readonly search?: string
  /** Relations to eager-load. */
  readonly includes?: readonly string[]
  /** Fields to compute facet counts for. */
  readonly facets?: readonly string[]
}

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
 * {@link ListMembershipFilter.value}). A filter whose `value` shape contradicts its operator (a scalar
 * for `in`, an array for `eq`, a value on `null`) is a caller fault rejected as a fatal `http/request`
 * error rather than silently mis-serialized. A filter whose `field` is a reserved control name
 * ({@link RESERVED_FIELDS}) is rejected for the same reason. Reuses `http` entirely — the returned
 * params flow through URL safety, the credential guard, auth injection, timeout, retry, and the codec
 * unchanged.
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
    // An empty item cannot round-trip: `[]` and `[""]` both encode to `in.()` and a trailing empty
    // item is dropped by the list parser, so two distinct requests would share one wire form.
    if (filter.value.some((v) => String(v) === "")) {
      throw HttpError.request(
        `The '${filter.op}' filter on '${filter.field}' cannot contain an empty-string value.`,
      )
    }
    return `${prefix}.(${filter.value.map((v) => escapeListValue(String(v))).join(",")})`
  }
  // Scalar operators: the discriminated union guarantees `filter` is a ScalarFilter here.
  const scalar = filter as { value: QueryValue }
  if (scalar.value === undefined || Array.isArray(scalar.value)) {
    throw HttpError.request(
      `The '${filter.op}' filter on '${filter.field}' requires a scalar value.`,
    )
  }
  return `${prefix}.${escapeScalarValue(String(scalar.value))}`
}

/**
 * Escape one value of a comma-delimited `in.(…)` list so a value carrying the delimiter or the escape
 * character survives the backend array parser, which treats `\` as an escape and `,` as a separator:
 * a literal backslash becomes `\\` and a literal comma `\,`. Backslash is escaped first so an escaped
 * comma is not double-escaped. Without this, `["a,b"]` would arrive as two values, not one.
 */
function escapeListValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,")
}

/**
 * Escape a scalar value so a literal backslash survives the backend's `\`-unescaping (`\` → `\\`). No
 * other character needs escaping: the server splits operator from value on the first `.` only, so a
 * value's own dots are safe.
 */
function escapeScalarValue(value: string): string {
  return value.replace(/\\/g, "\\\\")
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
