// Small deterministic prelude for `@plainworks/testkit`. Seam fakes live on `./fakes`; React,
// query, Connect, and Playwright harnesses stay on their named integration subpaths.

export { expectErr, expectOk } from "./assert"
export type { Deferred } from "./async"
export { deferred, flushMicrotasks } from "./async"
export type { SeededRandom } from "./determinism"
export { seededRandom } from "./determinism"
export type { AutoBackoffDelay, ManualClock, ManualDelay, PendingDelay } from "./time"
export { autoBackoffDelay, manualClock, manualDelay } from "./time"
