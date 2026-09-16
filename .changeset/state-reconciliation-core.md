---
"@plainworks/std": patch
"@plainworks/state": patch
"@plainworks/theme": patch
"@plainworks/testkit": patch
---

Consolidate state reconciliation into one core. `std` now owns `createSourceReconciler` — the
latest-wins, removal-aware loop that closes the three read races (out-of-order reads, a local write
racing a read, and an external clear) — so `state`'s scoped mirrors and `theme`'s provider share one
implementation instead of each hand-rolling it. The theme provider now resets to its configured
initial when the source is cleared externally (previously it stranded the stale theme) and marks its
own writes so an in-flight read cannot clobber a fresher value. `std` also gains `parseCookieHeader`
(the read half of its cookie grammar, now used by theme), `theme` throws a typed `ThemeError`, and
`testkit`'s `deferredStateSource` accepts `echoesLocalWrites` to model a backend that does not echo
the local writer.
