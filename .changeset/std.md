---
"@plainworks/std": patch
---

Add `@plainworks/std` (L0), the zero-dependency, host-independent bottom of the layer graph: typed errors (`PlainError` preserving `cause` + `kind`, `ensureError`, `getErrorMessage`), a `Result` model (`ok`/`err`/`isOk`/`isErr`/`unwrap`/`unwrapOr`), type guards (`isDefined`, `isRecord`, `isNonEmptyString`, `hasProperty`), assertions (`assert`, `assertNever`), utilities (`randomId`, `systemClock` + the `Clock` seam), and the shared contracts higher layers implement — the header-only `AuthHeaderProvider`/`AuthHeaders` auth seam and the `PlainEvent`/`Listener`/`Subscription` event shapes (single source of truth, no drifting copies).
