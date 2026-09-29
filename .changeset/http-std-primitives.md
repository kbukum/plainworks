---
"@plainworks/http": minor
---

Build on the shared std primitives. `options.fetch` is now typed as std's `WebFetch` and the `FetchLike` type is gone. Time is injected as `clock?: Clock` instead of `now`. JSON bodies are encoded through `stringifyJson`, so a nested function or `NaN` is rejected instead of silently dropped, and responses are read through std's bounded reader.
