/**
 * The list-read operator **vocabulary** — the abstract operator *names* the contract offers, as a
 * concept, independent of how any transport serializes them. Derived from the filter variants below
 * ({@link ListFilter}`["op"]`), so an operator without a value shape cannot exist and a new variant
 * extends the vocabulary by construction — one source of truth. A filter builder derives its
 * operator picker from this union; `@plainworks/http` maps it to the PostgREST wire tokens,
 * `connect`/`graphql` would map it to their own. `null`/`notNull` are value-less presence checks;
 * `in`/`nin` take a list; every other operator takes a single scalar.
 */
export type FilterOperator = ListFilter["op"]

/** A scalar filter value — the neutral, protocol-independent scalar the list contract compares against. A transport maps it to its own wire value when serializing; the contract itself owns no wire concern. */
export type FilterValue = string | number | boolean

/** Sort direction for {@link ListQueryParams.sortBy}. */
export type SortDirection = "asc" | "desc"

/** A scalar-comparison filter — `field` compared with `op` against a single value. */
export interface ScalarFilter {
  /** Column/field the filter targets (e.g. `status`, `price`). */
  readonly field: string
  /** A scalar operator. */
  readonly op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike"
  /** The scalar comparison value. */
  readonly value: FilterValue
}

/** A list-membership filter — `field` checked against a set of values. */
export interface ListMembershipFilter {
  /** Column/field the filter targets (e.g. `tags`, `role`). */
  readonly field: string
  /** A list operator. */
  readonly op: "in" | "nin"
  /** The values to match against. */
  readonly value: readonly FilterValue[]
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
 * time; a transport revalidates the shape at its own wire boundary.
 */
export type ListFilter = ScalarFilter | ListMembershipFilter | PresenceFilter

/**
 * The canonical, typed **list-read** request — filter, sort, paginate (offset **or** cursor), free-text
 * search, eager-load, and facet. This one param object is the bridge shared by the `http` wire builder
 * (`buildListQuery`) and the `query` cache-key derivation, so the same request keys the cache and
 * hits the backend. Offset (`page`/`pageSize`) suits stable jump-to-page lists; `cursor` suits large or
 * mutating lists and `useInfiniteQuery` (offset drifts as rows change). The two modes are mutually
 * exclusive per request — supplying both `page` and `cursor` is a caller fault rejected by
 * `buildListQuery`.
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
