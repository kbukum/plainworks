# Reuse

The duplication risk in a foundation kit is internal: did the change rebuild something a lower owner or the platform already provides? Assume duplication until proven otherwise.

Rules: [Ownership boundary](../../../engineering.md#ownership-boundary). Owners: [Concern owners](../../../../docs/architecture.md#concern-owners).

**Changes:** for each new type or helper, name its concern and find the owner. **Project:** sweep `packages/` for the patterns below and reconcile each with its owner.

## Checks

| Finding | Severity |
|---|---|
| Shared concern reimplemented beside its owner: errors and results, guards, retry and backoff, timeouts, contracts, event shapes, test doubles | blocker |
| A near-copy with one tweaked line | blocker |
| Platform facility rebuilt (`AbortSignal`, `structuredClone`, `crypto.subtle`, `URL`, `EventTarget`) | should-fix |
| A genuinely foundational concern solved locally instead of added to its owner | should-fix |

If the owner falls short, enhance it generically with tests so every consumer benefits. Name the exact package and export that should have been used, such as "use the `std` retry policy, not a `setTimeout` loop".

`std` may keep local doubles because `testkit` depends on it; every other package reuses `testkit`.

## Detection starters

```bash
rg "class \w*Error|throw ['\"]" packages/*/src
rg "setTimeout\(|retry|backoff" packages/*/src
rg "structuredClone|deepClone|cloneDeep" packages/*/src
rg "new EventTarget|type .*Event =" packages/*/src
```
