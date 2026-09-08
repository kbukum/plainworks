/**
 * Offset-mode pagination metadata — the `{ page, pageSize, total, totalPages }` block the canonical
 * list contract returns alongside a page of rows. Backends implementing this contract serialize
 * these exact camelCase field names.
 */
export interface PageInfo {
  /** 1-based number of the returned page. */
  readonly page: number
  /** Rows requested per page. */
  readonly pageSize: number
  /** Total rows matching the filter across all pages. */
  readonly total: number
  /** Total number of pages at this `pageSize`. */
  readonly totalPages: number
}

/** Facet counts by field then value — the optional `facets` block a faceted list response carries. */
export type Facets = Readonly<Record<string, Readonly<Record<string, number>>>>

/**
 * The **offset** list-response envelope — a page of `data`, its {@link PageInfo}, and optional
 * {@link Facets}. `T` is the already-decoded, schema-validated row type; the wire is the
 * `{ data, pagination, facets }` JSON the canonical contract specifies, so a frontend consumes what
 * a backend implementing this contract emits without translation.
 */
export interface PaginatedResult<T> {
  /** The rows on this page. */
  readonly data: readonly T[]
  /** Offset pagination metadata for this page. */
  readonly pagination: PageInfo
  /** Optional facet counts, when facets were requested. */
  readonly facets?: Facets
}

/** Cursor-mode pagination metadata — opaque next/prev cursors instead of page counts. */
export interface CursorInfo {
  /** Rows requested per page. */
  readonly pageSize: number
  /** Cursor to fetch the following page, or `null` at the end of the list. */
  readonly nextCursor: string | null
  /** Cursor to fetch the preceding page, or `null` at the start. */
  readonly prevCursor: string | null
}

/**
 * The **cursor** list-response envelope — a page of `data` plus {@link CursorInfo}. Cursor mode is
 * the default for infinite lists: unlike an offset page, a cursor does not drift as rows are
 * inserted or removed between fetches, which is exactly what `useInfiniteQuery` needs. This is the
 * plainworks canonical cursor envelope; backends implementing cursor pagination emit this shape.
 */
export interface CursorResult<T> {
  /** The rows on this page. */
  readonly data: readonly T[]
  /** Cursor pagination metadata for this page. */
  readonly pagination: CursorInfo
  /** Optional facet counts, when facets were requested. */
  readonly facets?: Facets
}
