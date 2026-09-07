---
"@plainworks/std": patch
"@plainworks/state": patch
"@plainworks/testkit": patch
---

Add **scope-unified state**: one consumer surface that reads the same value whether it lives in memory, `localStorage`, `sessionStorage`, a cookie, the URL — or a future remote backend — relocated by a single `scope:` field, never a call-site rewrite.

`@plainworks/std` gains the L0 `StateSource<Value>` seam (`capabilities` + async `get`/`set`/`remove`, each accepting an optional `AbortSignal` so the owner can cancel in-flight work, + `subscribe`) plus `StateCapabilities` and `StateSerializer`, describing *where a value lives* independently of any React binding.

`@plainworks/state` composes that backend with its store binding. The server-safe `.` entry adds the `memory` scope (backed by the owned `createStore`), the `Scope`/`SourceSpec` contract (a `Scope` carries static `capabilities`, plus an optional Standard Schema `schema` to validate a decoded value at the read trust boundary), `jsonSerializer`/`stringSerializer`, and the typed `StateSourceError`. The DOM-free `./client` entry holds the scoped-state hooks (the React-without-DOM bucket), and the separate DOM-only `./client/scope` subpath adds the host-backed scopes — `persistentScope`/`sessionScope` (Web Storage, cross-tab aware), `cookieScope` (attribute-controlled, size-guarded, non-secret only), `urlScope` (search/hash) — each an injected host seam with a platform default (mirroring `http`'s `fetch` seam).

The consumer surface is a **callable `use`-prefixed hook**, exactly like Zustand's `create`: `const useTheme = createScopedState({...})`, then `useTheme((s) => s.slice)` to read, `useTheme.useApi()` for the imperative handle, and `useTheme.Provider` for the per-request boundary. `createScopedObject({ fields })` composes **one object whose fields each live in a different scope**, with patch-only writes that fan each named field to its own backend and raise a typed aggregate `StateSourceError` on partial failure. Both accept an optional `({ set, get }) => actions` factory and a `sensitivity: "secret"` guard that rejects a secret in any non-memory-equivalent scope at construction. The `Provider` renders the seed first (matching server markup, so no hydration mismatch), then reconciles against the backend and stays in sync with external changes.

`@plainworks/testkit` adds `fakeStateSource` (synchronous in-memory) and `asyncStateSource` (gated reads, external-push, subscriber introspection) so scoped state is provable without a browser, including the async/remote shape.
