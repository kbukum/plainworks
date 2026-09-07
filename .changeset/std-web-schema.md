---
"@plainworks/std": minor
---

Extend `@plainworks/std` (L0) with the two seams every host-independent transport needs at its edges, both zero-dependency and server-safe.

**Breaking (pre-1.0):** the resilience primitives (`withTimeout`, `combineSignals`, `createDeadline`, `runWithRetry`, `createBoundedQueue`) now type their cancellation signal as the host-independent `WebAbortSignal` instead of the DOM/Node `AbortSignal`. A native `AbortSignal` you pass *in* still satisfies the seam (it is a structural superset), but the signal a callback *receives* is now `WebAbortSignal`, which is not directly assignable to a parameter typed as the native `AbortSignal` — forward it to another `Web*` seam (e.g. `options.fetch`) or adapt it at the boundary.

`web`: self-contained **structural** types for the universal Web-platform surface every target runtime shares (`WebFetch`/`WebResponse`/`WebHeaders`/`WebRequestInit`/`WebAbortSignal`/`WebURL`/`WebURLSearchParams` plus the `WebReadableStream`/`WebTextDecoder` streaming-read surface). They are declared here — not pulled from the DOM or `@types/node` libs — so a package can name `fetch`/`Headers`/`Response`/`URL` in its public API and ship a `.d.ts` that typechecks standalone against the ES2023 lib, without forcing a consumer to install DOM or Node types. A real platform value satisfies them by duck typing, and the repo-only `types/universal-web.d.ts` ambient binds the matching runtime globals to these same types so there is one source of truth.

`seam/schema`: the shared Standard Schema v1 validation seam (`StandardSchemaV1` and friends, owned structurally so any Zod/Valibot/ArkType schema is assignable without a `@standard-schema/spec` dependency), plus `validateWithSchema` (normalizing a sync-or-async validation into a `Result`) and `unsafePassthrough<T>()` — the single audited, opt-in escape hatch that returns a decoded value as `T` with no validation. This is the one seam `http` (and future `rest`/`graphql`/`query`) reuses to turn an untrusted decoded `unknown` into a typed value at a trust boundary.
