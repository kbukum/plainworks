---
"@plainworks/mocks": patch
---

Point the mock backend's filter parser at the list-query format owned by `@plainworks/http`, so the request builder and the mock parser share one implementation and can never drift. A fake backend legitimately depends on the wire format, not on the HTTP client, and the client never depends on the mocks, so there's no dependency cycle. The abstract operator names and the page envelope still come from `@plainworks/std`.
