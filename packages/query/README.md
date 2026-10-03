# @plainworks/query

> Host-independent TanStack Query layer — the kit's **protocol-agnostic cache substrate**: a per-request client factory, `events`→cache routing, a query event sink, RSC prefetch/hydrate helpers, the `remote` state scope, and list cache keys.

Part of the [plainworks](../../README.md) kit.

`query` is deliberately the layer *below* any protocol. It never learns a wire format, and a transport (`http`, `connect`, `channel`) never imports it — that is what keeps Query **optional**: a host on RSC + Server Actions can omit it and every transport still works. Its value is the pieces that are protocol-agnostic: the provider, the cache routing, the `remote` scope, and the list cache keys.

## Install

```sh
bun add @plainworks/query @tanstack/query-core @tanstack/react-query
```

## Runtime primitives

`query` is a **neutral** package (every entry except `./client`) touching no host global, so it runs on server, edge, workers, and RSC. Its `./client` bindings are the **React-without-DOM** bucket — pure React context over TanStack's `QueryClientProvider`/`HydrationBoundary`, no DOM — so the provider runs on React Native/Expo too, not just the browser. See [`docs/architecture.md › Runtime primitives`](../../docs/architecture.md#runtime-primitives).

## Entries

| Import | What it gives you |
|---|---|
| `@plainworks/query` | `createQueryClient`, the per-request client factory. |
| `@plainworks/query/cache` | Cache routing, optimistic updates, and `createLiveQuery` snapshot ownership. |
| `@plainworks/query/hydration` | RSC prefetch, dehydrate, and hydrate. |
| `@plainworks/query/remote` | The `remote` state scope. |
| `@plainworks/query/list` | List cache keys and query options. |
| `@plainworks/query/http-list` | `httpListQuery`: one validated HTTP list read plus its query plan. |
| `@plainworks/query/mutation` | `optimisticMutationOptions`: an optimistic write with rollback and a re-sync. |
| `@plainworks/query/client` | The React `QueryProvider` and `HydrationBoundary`. |

## The client factory (`.`)

`createQueryClient` is a **factory**, never a module-level singleton — every call returns a fresh TanStack `QueryClient` with no import-time side effects. That is the SSR/RSC-safe contract: the server builds one client per request (so one user's cache never leaks into another), while the browser builds one at startup and reuses it. **The host owns the client's lifetime** — the provider never creates or retains one (see below).

```ts
import { createQueryClient } from "@plainworks/query"

const client = createQueryClient() // pass a QueryClientConfig to set kit-wide defaults
```

## Provider (`./client`)

Mount the `"use client"` provider once near the root, passing a host-created `client`; below it, read the cache with the TanStack hooks (or a transport's own hooks, e.g. connect-query). On the server, build one client per request. In the browser, build one at startup and reuse it. On React Native/Expo, also call `environmentManager.setIsServer(() => false)` once at startup — passing a client does not change TanStack's no-window-means-server detection.

```tsx
import { QueryProvider } from "@plainworks/query/client"
import { createQueryClient } from "@plainworks/query"

const client = createQueryClient()

<QueryProvider client={client}>
  <App />
</QueryProvider>
```

## Cache routing — one pattern, every protocol

Two helpers fold external signals into the cache. `writeQueryData` carries a payload; `createCacheInvalidator` implements the `CacheInvalidator` seam from `@plainworks/std/seam`, which marks entries stale so they refetch. A key is a prefix unless you set `exact`, and an abort cancels the refetches. Protocol packages such as `@plainworks/connect` take this seam, so they never import `query`. `optimisticUpdate` applies a value now and hands back a `rollback` for the failure path — compare-and-set, so a failed older mutation never overwrites a newer write (`rollback()` returns whether it restored).

```ts
import { createCacheInvalidator, optimisticUpdate, writeQueryData } from "@plainworks/query/cache"

writeQueryData(client, ["user", 1], { id: 1, name: "Ada" })
await createCacheInvalidator(client).invalidate({ key: ["users"] })

const { rollback } = optimisticUpdate({
  client,
  queryKey: ["user", 1],
  apply: (u) => ({ ...u, name: "Grace" }),
})
// on error: rollback()
```

### Event sink — the cache-side counterpart to `channel`'s state sink

`createQueryEventSink` folds a decoded `PlainEvent` into the cache through the same neutral event shape that drives a `channel` `StateSource`. A pure `QueryEventRouter` maps each event to one action — `set` or `invalidate` — and the sink applies it. `deliver` is async, honors an `AbortSignal` (a delivery after teardown is dropped), and awaits an invalidate's refetches so a fast stream applies backpressure. One seam, two sinks (state + query) — no bespoke event bus.

```ts
import { createQueryEventSink } from "@plainworks/query/cache"

const sink = createQueryEventSink(client, (event) =>
  event.type === "user.renamed"
    ? { kind: "set", queryKey: ["user", event.data.id], update: event.data }
    : { kind: "invalidate", target: { key: ["users"] } },
)
await sink.deliver(event) // wired to a channel stream at the app layer
```

## Live snapshots

`createLiveQuery(client, plan)` is an `EventSink` that owns snapshot fetching. Wire it into the channel router **before connecting**. A validated `connected` or `reset` boundary starts the first fetch. Application events, resets, local overflow, and ordinary query invalidations mark the snapshot stale; they never overlay event payloads.

```ts
import { createLiveQuery } from "@plainworks/query/cache"

const live = createLiveQuery(client, {
  queryKey: ["tasks"],
  queryFn: ({ signal }) => readTasks(signal),
})
const subscription = live.subscribe(() => renderSyncStatus(live.status, live.error))
// Pass `live` to the channel router's sinks before channel.connect().
// On an explicit user refresh:
live.refresh()
// On teardown (the router also calls live.close()):
subscription.unsubscribe()
live.close()
```

Use one live owner per query key and disabled Query observers for the UI. Remote state sources already use disabled observers; they subscribe but do not fetch. The live owner explicitly fetches those same cache entries, so a remote-only subscriber converges too.

Recovery defaults to **two snapshot attempts in 30 seconds**, with jittered waits. A new event or reconnect cancels an in-flight snapshot and invalidates its generation; a late response cannot roll the cache back even if its fetch ignores cancellation. Repeated invalidations coalesce without resetting the recovery budget. Exhaustion exposes `status: "stale"` and `SnapshotStaleError`, retaining the last known data until explicit `refresh()`. Render that state and a refresh action rather than presenting stale data as current. Keep terminal channel errors separate: teardown sets the owner to `closed`, where `refresh()` cannot restart it.

Query retries are disabled for owned snapshots. A transport failure stops recovery, leaving the transport as the sole retry owner; a server minimum is never bypassed by another Query retry loop. Closing cancels the fetch and waits, removes the invalidation subscription, and releases status listeners.

Generic `createQueryEventSink` remains useful for other event contracts. Its invalidation alone is not a fetch owner for disabled observers, and arbitrary `set` actions are not a replacement for snapshot convergence.

## The `remote` scope — server-owned state through the unified surface

`createRemoteScope` implements the `state` `Scope`/`StateSource` seam **backed by the TanStack cache**, so `createScopedState({ scope: createRemoteScope({ client }), ... })` reads/writes/subscribes a server-owned value through the **same** surface as `memory`/`persistent`/`cookie`/`url` — with no change to the seam. It *routes* into the cache (reads via `getQueryData`, writes via `setQueryData`, subscribes to the query's own change events); it does not reimplement caching, dedup, or invalidation. Its `REMOTE_CAPABILITIES` mark it `authority: remote`, async, and non-durable, so the same secret guard that keeps tokens out of `persistent`/`cookie`/`url` keeps them out of `remote` too.

```ts
import { createScopedState } from "@plainworks/state/client"
import { createRemoteScope } from "@plainworks/query/remote"

const useCount = createScopedState<number>({
  scope: createRemoteScope({ client }),
  key: "count",
  initial: 0,
})
```

`query` (L2) implements the seam `state` (L1) defines, and the client is injected at composition — so `state` never depends on `query` and the L1→L2 direction is never inverted.

## RSC prefetch → dehydrate → hydrate

Warm the cache on the server, ship it to the browser, hydrate with no loading flash. Hydrated data stays fresh for `DEFAULT_QUERY_STALE_TIME_MS` (one minute), so the browser does not refetch it on mount; set your own `staleTime` in `createQueryClient` to change that. `prefetchQuery`/`prefetchInfiniteQuery` are **best-effort**: a warming failure resolves to a `{ status: "failed", cause }` `PrefetchOutcome` (never rejects) so it never aborts the server render, and the cause is preserved so the caller can log it — never swallowed. TanStack's default dehydration ships only successful queries, so a failed prefetch is not sent to the browser; the client mounts that query cold and fetches it fresh, where its own error boundary handles a repeat failure.

```tsx
// server
import { dehydrateClient, prefetchQuery } from "@plainworks/query/hydration"

await prefetchQuery(client, { queryKey: ["user", 1], queryFn: fetchUser })
// Everything dehydrated ships to the browser, so the query policy is required — an allowlist
// keeps server-only or sensitive queries out of the payload.
const state = dehydrateClient(client, {
  shouldDehydrateQuery: (query) => query.queryKey[0] === "user",
})

// client
<QueryProvider client={browserClient}>
  <HydrationBoundary state={state}>{children}</HydrationBoundary>
</QueryProvider>
```

## List cache keys — the list contract, cache side

The abstract list-read contract — the typed `ListQueryParams` and the `{ data, pagination, facets }` envelopes — is defined in [`@plainworks/std/list`](../std/README.md); the REST wire serializer (`buildListQuery`) lives in [`@plainworks/http/list`](../http/README.md). `query` owns the **deterministic cache-key derivation** from the same `ListQueryParams`. Equal params produce a deeply-equal key regardless of filter order; any filter/sort/page/search change keys distinctly. `infiniteListQueryKey` omits `page`/`cursor`, so every page of one `useInfiniteQuery` shares a key. Every cursor-mode fetch carries an explicit `cursor` — empty (`cursor=`) on the first page — so a backend implementing the contract can select cursor mode from the very first request.

```ts
import { buildListQuery } from "@plainworks/http/list"
import { infiniteListQueryOptions, listQueryOptions } from "@plainworks/query/list"
import { z } from "zod"

const itemSchema = z.object({ id: z.string(), name: z.string() })
// Validate the envelope at the trust boundary (the http README shows the reusable helper).
const pageSchema = z.object({
  data: z.array(itemSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
})

const plan = listQueryOptions({
  resource: "items",
  params,
  // The query-function signal is forwarded so an abandoned query cancels its in-flight request.
  fetch: async (p, signal) => {
    const page = await client.get("/items", {
      query: buildListQuery(p),
      signal,
      schema: pageSchema,
    })
    if (page === undefined) throw new Error("GET /items returned no body")
    return page
  },
})
// spread `plan` into useQuery; infiniteListQueryOptions spreads into useInfiniteQuery (cursor-paged)
```

`listQueryOptions`/`infiniteListQueryOptions` accept generated responses directly, including types whose `pagination` field is optional. At runtime, missing or invalid pagination throws `ListDecodeError`. Cursor pages end when `nextCursor` is absent; null is not a cursor. The helpers preserve response extensions and need no per-app proto conversion.

## HTTP lists (`./http-list`)

Most lists are a `GET` against the list contract. `httpListQuery` describes one once, and you get a validated read plus a query plan that share one cache key. A server prefetch and the client query then hit the same entry, so a hydrated page never refetches. Params go on the wire through `buildListQuery`, and every page is checked against the list envelope and your row guard before it is trusted.

```ts
import { httpListQuery } from "@plainworks/query/http-list"

export const taskList = httpListQuery<Task>({ path: "/api/tasks", resource: "tasks", row: isTask })

// Server: prefetch. Client: the same plan.
await queryClient.prefetchQuery(taskList.options(httpClient, params))
const tasks = useQuery(taskList.options(httpClient, params))

// Outside a query: one page, cancelled by the signal.
const page = await taskList.read(httpClient, params, signal)
```

A malformed page fails as an `HttpError` with kind `http/validate`. `@plainworks/http` is an optional peer, needed only for this entry.

## Optimistic writes (`./mutation`)

`optimisticMutationOptions` wraps the optimistic-write steps: cancel the list's in-flight fetches, apply the change to the cache, roll back on failure, and re-sync from the server when the last pending write settles. Spread the result into `useMutation`.

```ts
import { optimisticMutationOptions } from "@plainworks/query/mutation"

const rename = useMutation(
  optimisticMutationOptions({
    queryKey,
    mutationFn: (vars: { id: string; name: string }) => saveName(vars),
    apply: (page: PaginatedResult<Task> | undefined, vars) => page && renameRow(page, vars),
    // Optional: fold the server's answer in before the re-sync lands.
    reconcile: (page, saved) => page && replaceRow(page, saved),
  }),
)
```

| Option | What it does |
|---|---|
| `queryKey` | The cache entry the write changes. It is cancelled, patched, and re-synced once the last overlapping write to it settles. |
| `apply` | Returns the optimistic cache value. Skipped when nothing is cached. |
| `reconcile` | Optional. Writes the server's result into the cache on success. |
| `scope` | Optional TanStack scope. Writes in one scope run one at a time. |
