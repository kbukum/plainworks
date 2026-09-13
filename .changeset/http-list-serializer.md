---
"@plainworks/http": patch
---

Make `@plainworks/http` the single home of the list-query wire format in both directions — building a URL and parsing one — so the request builder and any backend parser share one implementation and can never drift.

- The operator tokens and the value escaping/parsing all live here as one round-trippable set, instead of two hand-mirrored copies in different packages.
- The request builder keeps its clear, typed errors for caller mistakes.
- The abstract list types still come from `@plainworks/std` and are re-exported here, so consumers import the contract next to its builder.

The URLs produced and parsed are unchanged; a round-trip test proves building and parsing are exact inverses.
