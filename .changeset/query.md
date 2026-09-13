---
"@plainworks/query": patch
---

Add `@plainworks/query`, a TanStack Query layer that acts as the kit's caching foundation. It never learns any wire format and no transport depends on it, so it stays optional. It runs anywhere, including React Native; the provider lives on a separate DOM-free import.

- **Per-request client** — you create the query client yourself, one per server request or one at browser startup, with no shared global.
- **One caching pattern for every protocol** — helpers to write into the cache, invalidate it, and do optimistic updates with a safe rollback that only undoes its own change, so a failed older update never clobbers a newer one.
- **Event sink** — folds incoming events into the cache through the same event shape the channel package uses, so there's one seam feeding both state and query.
- **Remote scope** — lets scoped state read server-owned data through the same scoped-state API, without exposing secrets.
- **Server-render hydration** — prefetch helpers that never crash a server render on a warming failure, and dehydration that requires you to explicitly choose what crosses to the browser, so nothing leaks by default.
- **List cache keys** — deterministic, order-independent keys derived from the shared list options, plus ready-made options for page-based and cursor-based lists that keep keys and fetches in sync.
