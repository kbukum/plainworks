import type { ListFilter, ListQueryParams } from "@plainworks/std"
import type { QueryKey } from "@tanstack/query-core"

/** Default namespace for list keys, keeping scoped list slots from colliding with a transport's own keys. */
const DEFAULT_LIST_PREFIX: QueryKey = ["plainworks", "list"]

/** Options shared by the list key derivations. */
export interface ListKeyOptions {
  /** Key prefix; defaults to `["plainworks", "list"]`. */
  readonly keyPrefix?: QueryKey
}

/** Options for the infinite key derivation — adds the initial cursor so plans starting at different cursors key distinctly. */
export interface InfiniteListKeyOptions extends ListKeyOptions {
  /** The initial cursor this infinite list starts from; included in the key so two plans at different cursors never share a cache entry. Omission and `""` are the same first-page request and normalize to one key. */
  readonly initialCursor?: string
}

/**
 * Derive a deterministic **offset** list cache key: equal params produce a deeply-equal key
 * regardless of the order filters were written in, and any filter/sort/page/search variation keys
 * distinctly. The key is `[...prefix, resource, "list", canonical]` where `canonical` is the params
 * in a stable, order-independent shape — the list analogue of how `connect` derives a stable key
 * from its method schema. Offset mode has no cursor: a `cursor` in the params is ignored here (it
 * belongs to {@link infiniteListQueryKey}). Feed it to `useQuery`/`prefetchQuery` for a single,
 * jump-to-page list.
 */
export function listQueryKey(
  resource: string,
  params: ListQueryParams,
  options: ListKeyOptions = {},
): QueryKey {
  const prefix = options.keyPrefix ?? DEFAULT_LIST_PREFIX
  return [...prefix, resource, "list", canonicalize(params, { includePage: true })]
}

/**
 * Derive a deterministic **infinite** list cache key — one key for the whole `useInfiniteQuery`,
 * shared across every fetched page. It deliberately **omits `page` and `cursor`**: those vary per
 * page (the cursor is the page param), so folding them into the key would scatter each page into
 * its own cache entry. Everything that defines the list identity (filters, sort, page size, search,
 * includes, facets) is included, so two infinite lists that differ in a filter key distinctly while
 * pages of one list share a key. The `initialCursor` is included so two plans starting at different
 * cursors never share a cache entry.
 */
export function infiniteListQueryKey(
  resource: string,
  params: ListQueryParams,
  options: InfiniteListKeyOptions = {},
): QueryKey {
  const prefix = options.keyPrefix ?? DEFAULT_LIST_PREFIX
  return [
    ...prefix,
    resource,
    "infinite",
    canonicalize(params, { includePage: false }),
    // Normalize the omitted initial cursor to `""` — the same first-page request `useInfiniteQuery`
    // fetches — so direct key users cannot split one list across two cache entries.
    options.initialCursor ?? "",
  ]
}

/** The stable, order-independent projection of a params object that both key derivations hash. */
interface CanonicalParams {
  readonly filters?: readonly ListFilter[]
  readonly page?: number
  readonly pageSize?: number
  readonly sortBy?: string
  readonly order?: string
  readonly search?: string
  readonly includes?: readonly string[]
  readonly facets?: readonly string[]
}

/**
 * Project params into a canonical shape. Filters are sorted by `(field, op, value)` and `includes`/
 * `facets` by code unit, so writing the same request sets in a different order yields an equal key
 * (an `AND` set has no order); `page`/`cursor` are included only in offset mode. Object key order
 * does not matter — TanStack's `hashKey` sorts object keys — so only the filter array needs
 * explicit ordering. Absent fields are omitted, not set to `undefined`, so a minimal request keys
 * minimally.
 */
function canonicalize(params: ListQueryParams, opts: { includePage: boolean }): CanonicalParams {
  const canonical: {
    filters?: readonly ListFilter[]
    page?: number
    pageSize?: number
    sortBy?: string
    order?: string
    search?: string
    includes?: readonly string[]
    facets?: readonly string[]
  } = {}
  if (params.filters !== undefined && params.filters.length > 0) {
    canonical.filters = [...params.filters].sort(compareFilters)
  }
  if (opts.includePage && params.page !== undefined) {
    canonical.page = params.page
  }
  if (params.pageSize !== undefined) {
    canonical.pageSize = params.pageSize
  }
  if (params.sortBy !== undefined) {
    canonical.sortBy = params.sortBy
  }
  if (params.order !== undefined) {
    canonical.order = params.order
  }
  if (params.search !== undefined) {
    canonical.search = params.search
  }
  if (params.includes !== undefined && params.includes.length > 0) {
    canonical.includes = [...params.includes].sort(compareCodeUnits)
  }
  if (params.facets !== undefined && params.facets.length > 0) {
    canonical.facets = [...params.facets].sort(compareCodeUnits)
  }
  return canonical
}

/** Total order over filters by field, then operator, then a stable string form of the value. */
function compareFilters(a: ListFilter, b: ListFilter): number {
  return (
    compareCodeUnits(a.field, b.field) ||
    compareCodeUnits(a.op, b.op) ||
    compareCodeUnits(stringifyValue(a), stringifyValue(b))
  )
}

/**
 * Locale-independent code-unit comparison — deterministic across every host and ICU locale, unlike
 * `localeCompare` which can order `"a"` vs `"B"` differently by locale.
 */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * A stable, type-preserving string form of a filter's value. Distinct values never collapse to the
 * same string: the value is tagged by its runtime type so `1` and `"1"` differ, and array elements
 * are length-prefixed so `["a,b", "c"]` and `["a", "b,c"]` differ. Array order is preserved —
 * `in.(a,b)` differs from `in.(b,a)`.
 */
function stringifyValue(filter: ListFilter): string {
  if (!("value" in filter) || filter.value === undefined) {
    return ""
  }
  const { value } = filter
  if (Array.isArray(value)) {
    return value.map((v) => `${typeof v}:${String(v).length}:${String(v)}`).join("|")
  }
  return `${typeof value}:${String(value).length}:${String(value)}`
}
