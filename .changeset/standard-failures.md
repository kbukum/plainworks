---
"@plainworks/std": minor
"@plainworks/http": minor
"@plainworks/connect": minor
"@plainworks/auth": minor
"@plainworks/channel": minor
"@plainworks/mocks": minor
"@plainworks/query": minor
"@plainworks/ui": minor
"@plainworks/devtools": minor
"@plainworks/app": minor
---

Failures now follow published standards only. `FailureCode` is the canonical `google.rpc` code set, with `httpStatusFor` and `failureCodeForStatus`. HTTP, SSE and channel failure frames decode RFC 9457 problems (`decodeProblem`); Connect decodes the standard `ErrorInfo`, `RetryInfo` and `BadRequest` details (`decodeRpcFailure`). Each transport, the auth store and the channel accept a `failures` decoder, so an app adapts a backend's own conventions without plainworks knowing about it. Sessions end only on failures that carry `authentication`. `failureTransport` is exported so any Connect transport, such as an in-memory router in tests, decodes failures the same way. Auth BFF failures are standard problems with a `reason` member, read by `sessionFailures`; pass it as the `failures` decoder of any HTTP client or SSE transport that calls those routes. Mocks build standard failures (`connectFailure`, `problemJson`, `problemFrame`) and own their stream fixtures; the backend corpus sync is gone.
