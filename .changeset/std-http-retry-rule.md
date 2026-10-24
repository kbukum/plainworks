---
"@plainworks/std": minor
"@plainworks/connect": patch
---

`@plainworks/std/failure` exports `isRetryableStatus`, the one HTTP retry rule (`408`, `429` and every `5xx`). `decodeProblem` and `classifyStatus` both use it, so they can no longer disagree. `decodeRpcFailure` now documents that it follows the RPC standard (`unavailable` or `RetryInfo`), which differs from HTTP when the server sends no explicit verdict.
