---
"@plainworks/mocks": minor
"@plainworks/connect": patch
"@plainworks/testkit": minor
---

New `@plainworks/mocks/connect` subpath: `connectUnary` mocks a Connect unary method with bounded body reads, input and output validation, and a gate for denied or unavailable endpoints, and `connectFailure` sends a standard Connect error for a canonical code with optional `google.rpc` details. `@plainworks/mocks/filter` exports `parseFilterString`, the one query-string parser the list handlers now share. The `@plainworks/testkit/connect` request builders now take the signal and headers Connect itself carries, so they compile under DOM or Node typings as well as the universal Web shim. `@plainworks/connect` no longer has a development dependency on `@plainworks/mocks`.
