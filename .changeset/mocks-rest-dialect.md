---
"@plainworks/mocks": patch
---

Bind the mock REST backend's filter parser to the list wire dialect owned by `@plainworks/http/list`, restoring a `@plainworks/mocks` → `@plainworks/http` dependency.

A fake REST **backend** legitimately depends on the REST **dialect** (the operator token grammar and value codec), not on the HTTP client — so the earlier "a fake backend must not depend on `@plainworks/http`" premise is withdrawn. The parser now resolves operators and unescapes values through `splitOperatorToken`/`filterOperatorFromToken`/`unescapeValue`/`parseDelimitedList` imported from `@plainworks/http/list` instead of vendoring its own copies. Because the `buildListQuery` serializer and this parser now share one codec, the two ends can never drift. The operator **vocabulary** (`FilterOperator`) and the offset envelope type (`PageInfo`) still come from the abstract contract in `@plainworks/std`. `http` never imports `mocks`, so the `mocks → http` edge is acyclic.
