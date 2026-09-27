---
"@plainworks/std": minor
"@plainworks/state": patch
"@plainworks/theme": patch
---

Saved state now always ends on the user's latest choice, even with a slow or remote backend.

- **Ordered writes** — `createSourceReconciler` now writes as well as reads. Call `reconciler.set(value)` or `reconciler.remove()`. Writes run one at a time, and at most one waits. A newer write replaces the waiting one, which rejects with a typed `AbortError`, so an older value can never land last. Reads that arrive mid-write wait until writes finish, so they never roll back the value you just set.
- **Cancelled on unmount** — each write gets the reconciler's teardown signal. A write still pending at teardown also rejects with `AbortError`. Scoped state and the theme provider do not report it as a failure.
- **Blocked storage no longer crashes** — subscribing to a Web Storage scope no longer touches `localStorage`, so a browser that blocks storage gets the typed read error instead of a thrown `SecurityError`.
- **Breaking:** `markLocalWrite` is gone. Write through `reconciler.set` / `reconciler.remove` instead.
