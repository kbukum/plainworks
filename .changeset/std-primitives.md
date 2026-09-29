---
"@plainworks/std": minor
---

Redesign the entry points as a prelude plus modules, like a language's standard library. `@plainworks/std` is now only the prelude: typed errors, `Result`, guards and assertions. Every other concern is a module on its own subpath: `@plainworks/std/web`, `/time`, `/encoding`, `/resilience`, `/seam`, `/list`, `/random`, `/privacy` and `/pipeline`. Each name has one import path.

Add the shared primitives the rest of the kit was copying:

- **`std/web`:** bounded body readers (`readBoundedBytes`, `readBoundedText`, `PayloadTooLargeError`), a `fetch` lookup (`resolveFetch`) and `readCookie`. `WebReadableStream` now accepts native platform streams.
- **`std/encoding`:** JSON helpers (`Json`, `isJson`, `stringifyJson`, `escapeJsonForHtml`, `toBoundedJson`).
- **`std/time`:** `fixedClock` and `parseTimestamp`.
- **Prelude:** `isPositiveInteger` and `isNonNegativeInteger`.
