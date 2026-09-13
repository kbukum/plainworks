---
"@plainworks/std": patch
---

Define the shared, abstract shape of a list query in `@plainworks/std` — the request options (filters, paging, sorting, search), the response envelopes, and the names of the filter operators.

These are plain, host-independent types, so the fetch client, the query layer, and the mocks all agree on one definition. How a list query is turned into a URL is intentionally kept out of here and lives in `@plainworks/http`.
