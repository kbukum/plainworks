import type {
  Mutation,
  MutationCacheNotifyEvent,
  Query,
  QueryCacheNotifyEvent,
  QueryClient,
} from "@tanstack/query-core"
import type { SourceEvent } from "../../protocol"
import type { Source, SourceHandle } from "../../source"

/** Options for {@link createQuerySource}. */
export interface QuerySourceOptions {
  /** The TanStack query client to observe, built by the host (e.g. `createQueryClient`). */
  readonly client: QueryClient
  /**
   * Stable identity for this client instance. Required whenever an app composes more than one
   * client — the adapter never guesses identity from runtime state.
   */
  readonly instance: string
  /** Display label; defaults to `Query <instance>`. */
  readonly label?: string
  /** Clock for event and indicator timestamps. Defaults to `Date.now`. */
  readonly now?: () => number
  /**
   * Safe label projection for query and mutation keys. Prevents sensitive parameters or IDs
   * in query keys from leaking into event labels. Defaults to extracting the primary key segment
   * (e.g. `key[0]` if string) or a generic label.
   */
  readonly keyLabel?: (key: unknown) => string
}

const MAX_KEY_LABEL = 60

/**
 * Observe a TanStack query client as a devtools source: lifecycle summary events (fetch, success,
 * error — never payloads), an aggregate health indicator, and on-demand detail for one query at a
 * time. This is deliberately a *framework-level summary*: deep cache and mutation inspection is
 * left to the maintained TanStack devtools, which a host renders side by side as a custom panel.
 * Observation is read-only; the source subscribes through the public cache seams only.
 *
 * Lifecycle transitions (added, fetch, success, error, removed) are emitted directly — they are
 * discrete and sparse, so the timeline stays complete and volume is bounded by the session's
 * retention ring, which reports a truthful dropped count rather than silently collapsing terminal
 * events.
 */
export function createQuerySource(options: QuerySourceOptions): Source {
  const now = options.now ?? Date.now
  const keyLabel = options.keyLabel ?? defaultKeyLabel

  return {
    id: { kind: "query", instance: options.instance },
    label: options.label ?? `Query ${options.instance}`,
    connect(observer, _signal) {
      const detailIdByQuery = new Map<Query, string>()
      const queryByDetailId = new Map<string, Query>()
      let detailCounter = 0

      // One opaque id per Query, reused across refetches, so the maps stay bounded by the cache.
      function detailIdFor(query: Query): string {
        const existing = detailIdByQuery.get(query)
        if (existing !== undefined) return existing
        detailCounter += 1
        const id = `q${detailCounter}`
        detailIdByQuery.set(query, id)
        queryByDetailId.set(id, query)
        return id
      }

      function forgetQuery(query: Query): void {
        const id = detailIdByQuery.get(query)
        if (id === undefined) return
        detailIdByQuery.delete(query)
        queryByDetailId.delete(id)
      }

      const indicate = (): void => {
        try {
          observer.indicate(queriesIndicator(options.client, now(), options.instance))
          observer.recover()
        } catch (error) {
          observer.fail(error)
        }
      }

      const onQueryEvent = (event: QueryCacheNotifyEvent): void => {
        if (event.type === "removed") forgetQuery(event.query)
        try {
          const summary = summarizeQueryEvent(event, now(), keyLabel, detailIdFor)
          if (summary !== null) observer.emit(summary)
        } catch (error) {
          observer.fail(error)
          return
        }
        indicate()
      }
      const onMutationEvent = (event: MutationCacheNotifyEvent): void => {
        try {
          const summary = summarizeMutationEvent(event, now(), keyLabel)
          if (summary !== null) observer.emit(summary)
        } catch (error) {
          observer.fail(error)
          return
        }
        indicate()
      }

      const unsubscribeQueries = options.client.getQueryCache().subscribe(onQueryEvent)
      const unsubscribeMutations = options.client.getMutationCache().subscribe(onMutationEvent)
      indicate()

      const handle: SourceHandle = {
        resolveDetail(ref) {
          const query = queryByDetailId.get(ref)
          if (!query) throw new Error(`No query retained for ${ref}.`)
          return Promise.resolve(detailOfQuery(query))
        },
        dispose() {
          unsubscribeQueries()
          unsubscribeMutations()
          detailIdByQuery.clear()
          queryByDetailId.clear()
        },
      }
      return handle
    },
  }
}

function summarizeQueryEvent(
  event: QueryCacheNotifyEvent,
  at: number,
  formatKey: (key: unknown) => string,
  detailIdFor: (query: Query) => string,
): SourceEvent | null {
  const keyLabel = truncateLabel(formatKey(event.query.queryKey))
  switch (event.type) {
    case "added":
      return { kind: "query.added", label: `Query ${keyLabel}`, severity: "info", at }
    case "removed":
      return { kind: "query.removed", label: `Query ${keyLabel} removed`, severity: "info", at }
    case "updated": {
      const action = event.action
      if (action.type === "fetch") {
        return { kind: "query.fetch", label: `Fetching ${keyLabel}`, severity: "info", at }
      }
      if (action.type === "success") {
        return {
          kind: "query.success",
          label: `Fetched ${keyLabel}`,
          severity: "ok",
          at,
          detail: detailIdFor(event.query),
        }
      }
      if (action.type === "error") {
        return {
          kind: "query.error",
          label: `Failed ${keyLabel}`,
          severity: "error",
          at,
          summary: { error: errorMessage(action.error) },
          detail: detailIdFor(event.query),
        }
      }
      return null
    }
    default:
      return null
  }
}

function summarizeMutationEvent(
  event: MutationCacheNotifyEvent,
  at: number,
  formatKey: (key: unknown) => string,
): SourceEvent | null {
  const mutation = event.mutation
  if (!mutation) return null
  const label = mutationLabel(mutation, formatKey)
  if (event.type === "updated") {
    // A mutation is only inserted into the cache on `added`; execution begins when the `pending`
    // action fires, so the start event is timestamped and recorded from there — never on `added`,
    // which would count mutations that were built but never run.
    if (event.action.type === "pending") {
      return { kind: "mutation.start", label: `Mutation ${label}`, severity: "info", at }
    }
    if (event.action.type === "success") {
      return { kind: "mutation.success", label: `Mutation ${label} succeeded`, severity: "ok", at }
    }
    if (event.action.type === "error") {
      return {
        kind: "mutation.error",
        label: `Mutation ${label} failed`,
        severity: "error",
        at,
        summary: { error: errorMessage(event.action.error) },
      }
    }
  }
  return null
}

function queriesIndicator(
  client: QueryClient,
  updatedAt: number,
  instance: string,
): {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly severity: "ok" | "info" | "error"
  readonly updatedAt: number
  readonly target: string
} {
  const queries = client.getQueryCache().getAll()
  const failing = queries.filter((query) => query.state.status === "error").length
  const fetching = queries.filter((query) => query.state.fetchStatus === "fetching").length
  const parts = [`${queries.length} tracked`]
  if (failing > 0) parts.push(`${failing} failing`)
  if (fetching > 0) parts.push(`${fetching} fetching`)
  return {
    id: "queries",
    label: `Query ${instance}`,
    value: parts.join(" · "),
    severity: failing > 0 ? "error" : fetching > 0 ? "info" : "ok",
    updatedAt,
    target: "query",
  }
}

function detailOfQuery(query: Query): Record<string, unknown> {
  return {
    queryKey: query.queryKey,
    status: query.state.status,
    fetchStatus: query.state.fetchStatus,
    dataUpdatedAt: query.state.dataUpdatedAt,
    errorUpdatedAt: query.state.errorUpdatedAt,
    observers: query.getObserversCount(),
    data: query.state.data,
    error: query.state.error === null ? null : errorMessage(query.state.error),
  }
}

function truncateLabel(text: string): string {
  return text.length > MAX_KEY_LABEL ? `${text.slice(0, MAX_KEY_LABEL - 1)}…` : text
}

function defaultKeyLabel(queryKey: unknown): string {
  if (Array.isArray(queryKey) && queryKey.length > 0) {
    const first = queryKey[0]
    if (typeof first === "string" && first.length > 0) {
      return truncateLabel(first)
    }
  }
  if (typeof queryKey === "string" && queryKey.length > 0) {
    return truncateLabel(queryKey)
  }
  return "query"
}

function mutationLabel(mutation: Mutation, formatKey: (key: unknown) => string): string {
  const key = mutation.options.mutationKey
  return key === undefined ? "mutation" : truncateLabel(formatKey(key))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error"
}
