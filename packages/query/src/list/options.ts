import type {
  CursorResult,
  ListQueryParams,
  PaginatedResult,
  WebAbortSignal,
} from "@plainworks/std"
import type { QueryFunctionContext, QueryKey } from "@tanstack/query-core"
import {
  type InfiniteListKeyOptions,
  infiniteListQueryKey,
  type ListKeyOptions,
  listQueryKey,
} from "./cache-key"

/** Inputs for {@link listQueryOptions} — the resource, the typed params, and how to fetch one page. */
export interface ListQueryOptionsInput<T> extends ListKeyOptions {
  /** Resource name the key is scoped to (e.g. `"items"`). */
  readonly resource: string
  /** The typed list request; a `cursor` (offset mode has none) is stripped before keying and fetching. */
  readonly params: ListQueryParams
  /** Fetch one offset page for `params` — typically an `http` list call returning the decoded envelope. Receives TanStack's abort signal so the fetch cancels when the query is abandoned. */
  readonly fetch: (params: ListQueryParams, signal: WebAbortSignal) => Promise<PaginatedResult<T>>
}

/** A ready-to-spread option object for `useQuery`/`prefetchQuery` — a deterministic key plus its fetch. */
export interface ListQueryPlan<T> {
  /** The offset list cache key derived from the params. */
  readonly queryKey: QueryKey
  /** Fetch the page the key represents. */
  readonly queryFn: (context: QueryFunctionContext) => Promise<PaginatedResult<T>>
}

/**
 * Assemble a {@link ListQueryPlan} for an **offset** list — the deterministic key from
 * {@link listQueryKey} paired with a `queryFn` that fetches exactly those params. Optional and
 * protocol-agnostic: `fetch` is any function returning the `PaginatedResult<T>` envelope (an `http`
 * list call, a fake in a test), so `query` never learns a protocol. The query-function signal is
 * threaded into `fetch` so an abandoned query cancels its in-flight request. Spread the result into
 * `useQuery`.
 */
export function listQueryOptions<T>(input: ListQueryOptionsInput<T>): ListQueryPlan<T> {
  // Offset mode has no cursor. Strip any caller-supplied `cursor` so the key (which already omits it)
  // and the fetch agree — otherwise two plans differing only by cursor would share a key yet fetch
  // different pages, returning one plan's page under the other's key.
  const { cursor: _cursor, ...params } = input.params
  return {
    queryKey: listQueryKey(input.resource, params, input),
    queryFn: ({ signal }) => input.fetch(params, signal),
  }
}

/** Inputs for {@link infiniteListQueryOptions} — like {@link ListQueryOptionsInput} but cursor-paged. */
export interface InfiniteListQueryOptionsInput<T> extends ListKeyOptions {
  /** Resource name the key is scoped to. */
  readonly resource: string
  /** The typed list request; its `cursor` is supplied per page by the infinite query (any caller-supplied `cursor` or `page` is stripped — the cursor is the page param and offset has no meaning here). */
  readonly params: ListQueryParams
  /** Fetch one cursor page — the `cursor` field is set to the current page param before this runs (an empty string on the first page, so the backend can select cursor mode from the first request). Receives TanStack's abort signal so the fetch cancels when the query is abandoned. */
  readonly fetch: (params: ListQueryParams, signal: WebAbortSignal) => Promise<CursorResult<T>>
  /** Cursor to start from; omit to start at the first page (fetched with an empty cursor). */
  readonly initialCursor?: string
}

/** A ready-to-spread option object for `useInfiniteQuery`, cursor-paged over the {@link CursorResult} envelope. */
export interface InfiniteListQueryPlan<T> {
  /** The single infinite list cache key shared across pages. */
  readonly queryKey: QueryKey
  /** Fetch the page for the current cursor page param. */
  readonly queryFn: (context: {
    readonly pageParam: string | undefined
    readonly signal: WebAbortSignal
  }) => Promise<CursorResult<T>>
  /** The first page's cursor (`undefined` = the start of the list). */
  readonly initialPageParam: string | undefined
  /** Next page's cursor, or `undefined` at the end — reads the envelope's `nextCursor`. */
  readonly getNextPageParam: (lastPage: CursorResult<T>) => string | undefined
  /** Previous page's cursor, or `undefined` at the start — reads the envelope's `prevCursor`. */
  readonly getPreviousPageParam: (firstPage: CursorResult<T>) => string | undefined
}

/**
 * Assemble an {@link InfiniteListQueryPlan} for a **cursor** list — one shared key from
 * {@link infiniteListQueryKey} plus the `initialPageParam`/`getNextPageParam`/`getPreviousPageParam`
 * wiring `useInfiniteQuery` needs. The current cursor is folded into `params.cursor` before each fetch,
 * and the next/prev cursors are read from the {@link CursorResult} envelope — the reason cursor is the
 * default for infinite lists (an offset would drift as rows change between fetches). Caller-supplied
 * `cursor` and `page` are stripped (the query engine owns the cursor; offset has no meaning here) so a
 * stray control param never leaks into the fetch or scatters the cache; the start point is
 * `initialCursor`, which is included in the cache key so plans starting at different cursors key
 * distinctly. Every fetch carries an explicit `cursor` — the empty string on the first page — so a
 * backend implementing the canonical contract can select cursor mode from the very first request
 * (without it, a cursor first page and a defaulted offset page 1 are identical on the wire). Spread
 * into `useInfiniteQuery`.
 */
export function infiniteListQueryOptions<T>(
  input: InfiniteListQueryOptionsInput<T>,
): InfiniteListQueryPlan<T> {
  const { cursor: _cursor, page: _page, ...baseParams } = input.params
  // The effective initial cursor — `""` (first page) when omitted, so plans that fetch identically
  // also key identically.
  const initialCursor = input.initialCursor ?? ""
  // Build key options without assigning `undefined` to optional props (exactOptionalPropertyTypes).
  const keyOptions: InfiniteListKeyOptions = {
    ...(input.keyPrefix !== undefined ? { keyPrefix: input.keyPrefix } : {}),
    initialCursor,
  }
  return {
    queryKey: infiniteListQueryKey(input.resource, baseParams, keyOptions),
    queryFn: ({ pageParam, signal }) =>
      input.fetch({ ...baseParams, cursor: pageParam ?? "" }, signal),
    initialPageParam: input.initialCursor,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor ?? undefined,
    getPreviousPageParam: (firstPage) => firstPage.pagination.prevCursor ?? undefined,
  }
}
