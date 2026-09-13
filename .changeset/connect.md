---
"@plainworks/connect": patch
---

Add `@plainworks/connect`, a Connect-RPC integration. It runs anywhere; the React hooks live on a separate DOM-free import.

You create a transport with a factory, one per context. It speaks Connect over `fetch` by default, or gRPC-Web, and reuses the shared resilience helpers: a per-attempt timeout and safe retries only for calls that can be repeated (whether a call is safe to retry is read from its own definition, so writes are never retried automatically). A streaming call isn't retried but is bounded by an idle timeout. Auth is header-only, re-injected on each retry, and refused once a URL has been rewritten across origins. Errors are mapped to a typed error at the boundary, keeping their cause. It also provides deterministic query keys and a cache invalidator.
