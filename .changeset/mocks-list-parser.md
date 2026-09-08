---
"@plainworks/mocks": patch
---

Make the `@plainworks/mocks` CRUD list handler parse the full canonical PostgREST wire `@plainworks/http` `buildListQuery` emits, so a request built by the frontend round-trips through the mock backend. The mock now consumes the operator-token contract from `@plainworks/http` (a new dependency) instead of vendoring a second copy, so builder and parser can never drift.

- **Shared operator tokens** — the mock filter language resolves operators through `FILTER_OPERATOR_TOKENS`/`filterOperatorFromToken` from `@plainworks/http`, the one canonical contract (multi-segment tokens like `not.in.(a,b)` match longest-first, never falling through to legacy equality).
- **Backslash round-trip** — scalar unescaping collapses `\\` → `\` (and `\,`/`\(`/`\)`), mirroring `escapeScalarValue`, so a value carrying a literal backslash decodes back to itself. Parentheses are data in scalar values: `eq.(foo)` parses as the scalar `(foo)`, never as the array form (which only `in`/`nin` take).
- **Direct `field=op.value` params and `pageSize`** — the list handler consumes the canonical vocabulary (`pageSize`, repeated `field=op.value` range filters) alongside the legacy `limit`/`filter=` forms.
- **Cursor mode, drift-free** — a request carrying `cursor` answers with the canonical `CursorResult` envelope (opaque **id-anchored** `n_<id>`/`p_<id>` tokens, `nextCursor`/`prevCursor`), so inserting, deleting, or reordering rows between requests never shifts what the next page returns. An empty `cursor=` is the first page; a foreign token, a stale anchor, or a `page`+`cursor` mix is a 400. The mock now serves the same infinite-list flow `infiniteListQueryOptions` drives.
- **Requested facets only** — the handler reads the `facets` parameter and computes only the requested fields (a 400 on an unknown one); no `facets` param, no facets block — matching the envelope's "when facets were requested" semantics.
- **Strict presence tokens** — `is.null`/`not.is.null` must end exactly; a suffixed token (`not.is.null.foo`) is unrecognised rather than silently applied as a presence filter.
