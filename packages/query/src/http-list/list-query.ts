import { type HttpClient, HttpError } from "@plainworks/http"
import { buildListQuery } from "@plainworks/http/list"
import { isPaginatedResult, type ListQueryParams, type PaginatedResult } from "@plainworks/std/list"
import { guardSchema } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"
import type { ListKeyOptions } from "../list/cache-key"
import { type ListQueryPlan, listQueryOptions } from "../list/options"

/** Configuration for {@link httpListQuery}. */
export interface HttpListQueryConfig<T> extends ListKeyOptions {
  /** The list endpoint, relative to the client's base URL (for example `/api/tasks`). */
  readonly path: string
  /** The resource name the cache key is scoped to (for example `"tasks"`). */
  readonly resource: string
  /** Validates one row. A page with any invalid row fails the read. */
  readonly row: (value: unknown) => value is T
}

/** One entity's HTTP list read and the matching query plan, from {@link httpListQuery}. */
export interface HttpListQuery<T> {
  /**
   * Read one validated page.
   *
   * @throws {HttpError} `http/validate` when the page or a row is malformed, `http/decode` when the
   *   response has no body, or any other `HttpError` the request raises.
   */
  read(
    client: HttpClient,
    params: ListQueryParams,
    signal?: WebAbortSignal,
  ): Promise<PaginatedResult<T>>
  /** The `useQuery`/`prefetchQuery` plan for `params`: the list cache key plus {@link read}. */
  options(client: HttpClient, params: ListQueryParams): ListQueryPlan<T>
}

/**
 * Describe an entity's paginated HTTP list once, then read it or query it anywhere. Params go on
 * the wire through `buildListQuery`, and every response is checked against the list envelope and
 * your row guard before it is trusted. The server prefetch and the client query share one key, so a
 * hydrated page is reused with no refetch.
 */
export function httpListQuery<T>(config: HttpListQueryConfig<T>): HttpListQuery<T> {
  const schema = guardSchema<PaginatedResult<T>>(
    (value): value is PaginatedResult<T> => isPaginatedResult(value, config.row),
    `response is not a page of ${config.resource}`,
  )
  const read = async (
    client: HttpClient,
    params: ListQueryParams,
    signal?: WebAbortSignal,
  ): Promise<PaginatedResult<T>> => {
    const page = await client.get(config.path, {
      query: buildListQuery(params),
      schema,
      ...(signal === undefined ? {} : { signal }),
    })
    if (page === undefined) {
      throw HttpError.decode({ message: `GET ${config.path} returned no body` })
    }
    return page
  }
  return {
    read,
    options: (client, params) =>
      listQueryOptions<T>({
        resource: config.resource,
        params,
        fetch: (pageParams, signal) => read(client, pageParams, signal),
        ...(config.keyPrefix === undefined ? {} : { keyPrefix: config.keyPrefix }),
      }),
  }
}
