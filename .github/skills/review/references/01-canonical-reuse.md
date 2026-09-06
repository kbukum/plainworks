# Pass 01 — Canonical-owner reuse

plainworks *is* the foundation, so the duplication risk is internal: **did the change reimplement something `@plainworks/std` (or the platform) already owns?** Fast AI-assisted code often reaches for a fresh local helper instead of the owner — assume duplication until proven otherwise. Treat findings here as a blocker class.

> **Run in a separate, clean-context agent** with a high-capability model. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation.

**Scope note.** *Changes mode:* for each new type/helper in the diff, name the concern and find its owner. *Project mode:* sweep `packages/` for the patterns below and reconcile each against the owning package — long-lived internal forks are what this pass exists to surface.

## The rule

Reuse or enhance the canonical lower owner before writing new code. Never duplicate a shared concern — **errors, result/guards, retry/backoff, contracts/seams, event shapes, and the shared test doubles**. If the owner is inadequate, enhance it *generically* (with tests) rather than forking a copy in another package. A fix belongs in the owner so every consumer benefits.

## How to check

`@plainworks/std` (L0) is the bottom owner: errors, result, type guards, retry/backoff, and the shared contracts/seams (the auth-header/token-provider seam, event shapes) live there. `@plainworks/testkit` owns the shared fakes/harnesses. For each candidate, name the concern, locate its owner, and confirm the change calls the owner rather than rewriting it:

- **Errors & result.** The `std` typed error / result type, cause preserved. A new local error class or a `throw "string"` for a shared concern is duplication.
- **Retry / backoff / timeout.** Come from `std` (backoff+jitter, retry ceiling), not a hand-rolled loop or ad-hoc `setTimeout` retry scattered per call site.
- **Contracts / seams / event shapes.** The auth-header seam and event shapes are defined once in the lowest package; a second copy in `connection`/`auth` is a fork.
- **Platform first (keep code current).** Before adding a dependency or helper, verify a current Web/platform API doesn't already cover it — `AbortController`/`AbortSignal` for cancellation, `structuredClone`, `crypto.subtle`, `URL`, `EventTarget`. Reinventing a platform facility (a custom deep-clone, a bespoke event emitter where the seam-into-Query/store pattern is intended) is a should-fix.
- **Test doubles.** Fakes/harnesses come from `@plainworks/testkit`, never hand-rolled inline in a test that duplicates one.
- **"Almost the same" counts.** A near-copy with one tweaked line is still a fork — enhance the owner to cover the new case.

## Detection starters

Flag candidates, not verdicts — read each hit, then name the owner that should have been used.

```bash
rg "class \w*Error|throw ['\"]" packages/*/src          # local error types / thrown strings
rg "setTimeout\(|retry|backoff" packages/*/src          # retry/backoff should come from std
rg "structuredClone|deepClone|cloneDeep" packages/*/src # platform structuredClone
rg "new EventTarget|type .*Event =" packages/*/src      # event shapes belong to std's seam
```

For each hit: is there a lower owner for this concern? If yes and the code doesn't use it → **blocker** (reuse). If no owner exists and it is genuinely foundational → it should be **added to `std`** (or the owning package), not solved locally; a local solution is a **should-fix** with an "upstream to the owner" note.

## Output for this pass

Per finding, name the concrete package/type that should have been used (e.g. "use the `std` retry policy instead of a hand-rolled `setTimeout` loop", "define the event shape in `std`, not a second copy in `connection`").
