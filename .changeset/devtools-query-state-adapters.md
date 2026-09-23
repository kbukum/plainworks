---
"@plainworks/devtools": patch
---

Add optional `@plainworks/devtools/query` and `@plainworks/devtools/state` adapter subpaths — separately importable, so apps that don't use them pay no dependency or bundle cost (`@tanstack/query-core` and `@plainworks/state` are optional peers).

- **Query summary, not a cache inspector** — `createQuerySource` watches a TanStack client through the public cache seams and emits fetch/success/error lifecycle events plus an aggregate health indicator (tracked/failing/fetching), with one query's full state loaded on demand. Deep inspection stays with the maintained TanStack devtools, rendered side by side as a custom panel.
- **Read-only, private-by-default state observation** — `createStateSource` turns a Plainworks store into bounded change summaries (changed top-level keys, never values) with the full projected snapshot on demand. A `snapshot` projection is **required**: only whitelisted fields are ever summarized, retained, or forwarded. No editing, no time travel.
- **Explicit identity** — every adapter takes a consumer-provided `instance` label, so multiple query clients, stores, and scopes never collide or get guessed identities.
- **Safe by construction** — query lifecycle transitions are emitted directly so no terminal (success/error) event is lost, with volume bounded by the session's retention ring and its truthful dropped-count signal; state bursts coalesce per interval. Consumer-supplied projections (`keyLabel`, `snapshot`) are isolated through the source observer, and a source that recovers from a transient failure clears its failed state on the next healthy cycle. Values cross the protocol only after whitelist + redaction + size bounds.
