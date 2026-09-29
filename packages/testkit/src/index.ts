// Public entry for `@plainworks/testkit` — the shared, deterministic test tooling every plainworks
// package tests against instead of hand-rolling one-off fakes. Re-export-only barrel (no logic
// here; implementation lives in concern modules). Server-safe: no React or DOM imports, so it runs
// under the default `node` test environment. Client render/axe helpers arrive with the `ui` step.
export type { Deferred } from "./async"
export { deferred, flushMicrotasks } from "./async"
export type { FakeAuthOptions, FakeAuthProvider } from "./auth"
export { fakeAuthHeaderProvider } from "./auth"
export type { FakeCacheInvalidator } from "./cache"
export { fakeCacheInvalidator } from "./cache"
export type { FakeStreamAttempt, FakeStreamTransport } from "./channel"
export { fakeStreamTransport } from "./channel"
export type { ManualClock } from "./clock"
export { manualClock } from "./clock"
export type { AutoBackoffDelay, ManualDelay, PendingDelay } from "./delay"
export { autoBackoffDelay, manualDelay } from "./delay"
export type { Recorder } from "./events"
export { recordEvents } from "./events"
export type { FakeFetch, FakeFetchImpl, FetchCall, FetchOutcome } from "./http"
export { fakeFetch } from "./http"
export type { MockAuthorizeResult, MockIdp, MockIdpAlg, MockIdpOptions } from "./oidc"
export { createMockIdp } from "./oidc"
export type { SeededRandom } from "./random"
export { seededRandom } from "./random"
export { expectErr, expectOk } from "./result"
export type { FakeSchemaOptions } from "./schema"
export { fakeSchema, guardSchema } from "./schema"
export type {
  AsyncStateSource,
  AsyncStateSourceOptions,
  DeferredRead,
  DeferredStateSource,
  DeferredStateSourceOptions,
  FakeStateSource,
  FakeStateSourceOptions,
} from "./state"
export { asyncStateSource, deferredStateSource, fakeStateSource } from "./state"
export type { RecordedTelemetry, TelemetryRecord } from "./telemetry"
export { recordTelemetry } from "./telemetry"
