// Public entry for `@plainworks/testkit` — the shared, deterministic test tooling every plainworks
// package tests against instead of hand-rolling one-off fakes. Re-export-only barrel (no logic
// here; implementation lives in concern modules). Server-safe: no React or DOM imports, so it runs
// under the default `node` test environment. Client render/axe helpers arrive with the `ui` step.
export type { Deferred } from "./async"
export { deferred, flushMicrotasks } from "./async"
export type { FakeAuthOptions, FakeAuthProvider } from "./auth"
export { fakeAuthHeaderProvider } from "./auth"
export type { ManualClock } from "./clock"
export { manualClock } from "./clock"
export type { Recorder, TestEmitter } from "./events"
export { createEmitter, recordEvents } from "./events"
export type { FakeFetch, FakeFetchImpl, FetchCall, FetchOutcome } from "./http"
export { fakeFetch } from "./http"
export type { SeededRandom } from "./random"
export { seededRandom } from "./random"
export { expectErr, expectOk } from "./result"
export type { FakeSchemaOptions } from "./schema"
export { fakeSchema, guardSchema } from "./schema"
