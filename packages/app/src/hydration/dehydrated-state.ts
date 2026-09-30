import { isRecord } from "@plainworks/std"
import type { DehydratedState } from "@tanstack/query-core"
import { AppConfigError } from "../errors"

// The structural schema of a TanStack `DehydratedState` as it crosses the hydration boundary.
// The server writer emits a live object and the client reader parses untrusted markup, so both
// sides agree on this one shape: the reader rejects anything malformed before hydration reads it,
// and the writer refuses anything JSON cannot carry faithfully.

const QUERY_STATUSES = new Set(["pending", "error", "success"])
const FETCH_STATUSES = new Set(["fetching", "paused", "idle"])

function isQueryState(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    QUERY_STATUSES.has(value.status) &&
    typeof value.fetchStatus === "string" &&
    FETCH_STATUSES.has(value.fetchStatus) &&
    typeof value.dataUpdatedAt === "number" &&
    typeof value.dataUpdateCount === "number" &&
    typeof value.errorUpdatedAt === "number" &&
    typeof value.errorUpdateCount === "number" &&
    typeof value.fetchFailureCount === "number" &&
    typeof value.isInvalidated === "boolean" &&
    "error" in value
  )
}

function isDehydratedQuery(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.queryKey) &&
    typeof value.queryHash === "string" &&
    isQueryState(value.state)
  )
}

function isDehydratedMutation(value: unknown): boolean {
  return isRecord(value) && isRecord(value.state)
}

/**
 * Validate untrusted markup as a {@link DehydratedState} before hydration reads it. TanStack's
 * `hydrate` trusts required status, timestamp, and fetch fields on every query state, so a query
 * carrying `state: {}` would build an invalid cache entry. This guard checks the full query and
 * mutation shape at the trust boundary so only a faithful dehydrated cache passes.
 */
export function isDehydratedState(value: unknown): value is DehydratedState {
  return (
    isRecord(value) &&
    Array.isArray(value.queries) &&
    value.queries.every(isDehydratedQuery) &&
    Array.isArray(value.mutations) &&
    value.mutations.every(isDehydratedMutation)
  )
}

/**
 * Reject a query cache the JSON script cannot carry faithfully. A pending query dehydrates with a
 * live `promise` for its in-flight fetch; `JSON.stringify` turns that Promise into `{}`, so the
 * client would treat the query as resolved with empty data instead of resuming the request. This
 * static payload has no transport for a Promise, so a pending query is a caller error: warm the
 * query before dehydrating, or exclude it with `shouldDehydrateQuery`.
 *
 * @throws {AppConfigError} When any dehydrated query is still pending.
 */
export function assertTransportableQueryCache(state: DehydratedState): void {
  for (const query of state.queries) {
    if (query.promise !== undefined || query.state.status === "pending") {
      const key = JSON.stringify(query.queryKey)
      throw new AppConfigError(
        `Cannot serialize the pending query ${key}: this payload has no transport for an ` +
          "in-flight request. Await the query before dehydrating, or exclude it with " +
          "shouldDehydrateQuery.",
      )
    }
  }
}
