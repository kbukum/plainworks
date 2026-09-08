---
"@plainworks/http": patch
---

Make `@plainworks/http/list` the single home of the PostgREST/Supabase list **wire dialect** — both directions — so the request builder and any REST backend parser bind to one codec and can never drift.

- **The whole REST dialect lives here.** The operator→token map (`FILTER_OPERATOR_TOKENS`), the longest-first token ordering (`FILTER_OPERATOR_TOKENS_LONGEST_FIRST`), the token resolvers (`filterOperatorFromToken`, `splitOperatorToken`), and the value escape/parse codec (`escapeScalarValue`, `escapeListValue`, `unescapeValue`, `parseDelimitedList`) are defined together in `http`. Escape and unescape are one round-trippable pair, no longer two hand-mirrored halves in separate packages.
- **`buildListQuery` stays the serializer** — params → URL query string, keeping its typed `http/request` rejections for caller faults (offset+cursor together, reserved-field collisions, operator/value-shape mismatches, empty `in.()` items).
- **Abstract contract re-exported as a facade.** The list shapes and the `FilterOperator` vocabulary are defined in `@plainworks/std` and surfaced from `@plainworks/http` / `@plainworks/http/list` unchanged, so consumers still import the contract paired with its serializer. `http` defines no list *shape* of its own.

The emitted and parsed PostgREST strings are byte-identical to before; a serialize↔parse round-trip test proves the escape/unescape halves are inverses for delimiter and backslash edge cases.
