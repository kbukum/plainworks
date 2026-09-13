---
"@plainworks/http": patch
---

Add the list-query wire format to `@plainworks/http` (PostgREST style), so the frontend can describe a list request in typed terms and a compatible backend can parse it.

- Turn typed list options — filters, paging or cursor, sorting, search, includes, facets — into the URL query string, with careful handling of edge cases like escaping, empty values, and mutually exclusive paging modes. A request that contradicts itself fails clearly instead of being mis-encoded.
- The operator tokens are published on their own import, so a backend parser can share the exact same table the builder uses and the two can never drift.
- Typed response envelopes for both page-based and cursor-based results, validated like any other response body.

The matching cache-key half lives in `@plainworks/query`.
