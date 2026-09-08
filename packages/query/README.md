# @plainworks/query

> Host-independent TanStack Query layer — the kit's **protocol-agnostic cache substrate**: a per-request client factory, `events`→cache routing, a query event sink, RSC prefetch/hydrate helpers, the `remote` state scope, and PostgREST list cache keys.

Part of the [plainworks](../../README.md) kit.

`query` is deliberately the layer *below* any protocol. It never learns a wire format, and a transport (`http`, `connect`, `channel`) never imports it — that is what keeps Query **optional**: a host on RSC + Server Actions can omit it and every transport still works. Its value is the pieces that are protocol-agnostic: the provider, the cache routing, the `remote` scope, and the list cache keys.

## Install

```sh
bun add @plainworks/query @tanstack/query-core @tanstack/react-query
```

## Runtime primitives

`query` is a **neutral (`.`)** package touching no host global, so it runs on server, edge, workers, and RSC. Its `./client` bindings are the **React-without-DOM** bucket — pure React context over TanStack's `QueryClientProvider`/`HydrationBoundary`, no DOM — so the provider runs on React Native/Expo too, not just the browser. See [`docs/architecture.md › Axis 2`](../../docs/architecture.md).

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

Two helpers fold external signals into the cache. `writeQueryData` carries a payload; `invalidateCache` marks a prefix stale so it refetches. `optimisticUpdate` applies a value now and hands back a `rollback` for the failure path — compare-and-set, so a failed older mutation never overwrites a newer write (`rollback()` returns whether it restored).

```ts
import { writeQueryData, invalidateCache, optimisticUpdate } from "@plainworks/query"

writeQueryData(client, ["user", 1], { id: 1, name: "Ada" })
await invalidateCache(client, { queryKey: ["users"] })

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
import { createQueryEventSink } from "@plainworks/query"

const sink = createQueryEventSink(client, (event) =>
  event.type === "user.renamed"
    ? { kind: "set", queryKey: ["user", event.data.id], update: event.data }
    : { kind: "invalidate", filters: { queryKey: ["users"] } },
)
await sink.deliver(event) // wired to a channel stream at the app layer
```

## The `remote` scope — server-owned state through the unified surface

`createRemoteScope` implements the `state` `Scope`/`StateSource` seam **backed by the TanStack cache**, so `createScopedState({ scope: createRemoteScope({ client }), ... })` reads/writes/subscribes a server-owned value through the **same** surface as `memory`/`persistent`/`cookie`/`url` — with no change to the seam. It *routes* into the cache (reads via `getQueryData`, writes via `setQueryData`, subscribes to the query's own change events); it does not reimplement caching, dedup, or invalidation. Its `REMOTE_CAPABILITIES` mark it `authority: remote`, async, and non-durable, so the same secret guard that keeps tokens out of `persistent`/`cookie`/`url` keeps them out of `remote` too.

```ts
import { createScopedState } from "@plainworks/state/client"
import { createRemoteScope } from "@plainworks/query"

const useCount = createScopedState<number>({
  scope: createRemoteScope({ client }),
  key: "count",
  initial: 0,
})
```

`query` (L2) implements the seam `state` (L1) defines, and the client is injected at composition — so `state` never depends on `query` and the L1→L2 direction is never inverted.

## RSC prefetch → dehydrate → hydrate

Warm the cache on the server, ship it to the browser, hydrate with no loading flash. (Hydration is not "no refetch": with the default `staleTime: 0` a hydrated query is stale and refetches in the background on mount — freshness follows the client's stale policy.) `prefetchQuery`/`prefetchInfiniteQuery` are **best-effort**: a warming failure resolves to a `{ status: "failed", cause }` `PrefetchOutcome` (never rejects) so it never aborts the server render, and the cause is preserved so the caller can log it — never swallowed. TanStack's default dehydration ships only successful queries, so a failed prefetch is not sent to the browser; the client mounts that query cold and fetches it fresh, where its own error boundary handles a repeat failure.

```tsx
// server
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

## List cache keys — the PostgREST list contract, cache side

The wire half of the list-read contract (the typed param builder and `{ data, pagination, facets }` envelopes) lives in [`@plainworks/http`](../http/README.md); `query` owns the **deterministic cache-key derivation** from the same `ListQueryParams`. Equal params produce a deeply-equal key regardless of filter order; any filter/sort/page/search change keys distinctly. `infiniteListQueryKey` omits `page`/`cursor`, so every page of one `useInfiniteQuery` shares a key. Every cursor-mode fetch carries an explicit `cursor` — empty (`cursor=`) on the first page — so a backend implementing the contract can select cursor mode from the very first request.

```ts
import { listQueryOptions, infiniteListQueryOptions } from "@plainworks/query"
import { buildListQuery } from "@plainworks/http"
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

`listQueryOptions`/`infiniteListQueryOptions` are optional conveniences — a host may build keys by hand. `fetch` is any function returning the `PaginatedResult<T>`/`CursorResult<T>` envelope, so `query` never learns a protocol.
