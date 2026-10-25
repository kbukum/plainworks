import "server-only"

// The dev mock backend for the running host. Unlike the kit's per-request stores, its data outlives
// a request — it *is* the external system the app talks to, so its seeded fixtures persist across
// requests the way a real backend would. Built lazily on first use, never at import time.
//
// Outside production, a request can name a data scope in the `@plainworks/mocks/scope` header, and
// each scope gets its own seeded backend. The browser gate gives every test its own scope, so many
// workers share one `next dev`. Requests without the header, and every request in production,
// share the default backend.
//
// Dev-only note: This in-process backend is a single-process development adapter. In a
// multi-instance, worker, or serverless deployment, replace this catch-all route handler with calls
// to your real API origin or shared durable storage.

import { createMockScopes, type MockScopeHeaders, type MockScopes } from "@plainworks/mocks/scope"
import { fixedClock, systemClock } from "@plainworks/std/time"
import { createDemoBackend, type DemoBackend } from "./mock-dispatch"

let scopes: MockScopes<DemoBackend> | undefined

const UNSCOPED: MockScopeHeaders = { get: () => null }

function demoScopes(): MockScopes<DemoBackend> {
  const fixedNow = process.env.PLAINWORKS_FIXED_NOW
  scopes ??= createMockScopes({
    create: () =>
      createDemoBackend({
        seed: 7,
        clock: fixedNow === undefined ? systemClock : fixedClock(fixedNow),
      }),
  })
  return scopes
}

// Production never honors a client-chosen scope.
const scopeHeaders = (headers: MockScopeHeaders): MockScopeHeaders =>
  process.env.NODE_ENV === "production" ? UNSCOPED : headers

/**
 * The demo backend for the request's data scope, created on first use. `PLAINWORKS_FIXED_NOW` pins
 * its clock to one ISO-8601 instant, so the browser gate sees the same fixture dates on every run.
 *
 * @throws {MockScopeError} When the request names a malformed scope.
 */
export function demoBackend(headers: MockScopeHeaders): DemoBackend {
  return demoScopes().resolve(scopeHeaders(headers))
}

/**
 * Drop the request's data scope, so its next request starts from fresh fixtures.
 *
 * @throws {MockScopeError} When the request names a malformed scope.
 */
export function releaseDemoScope(headers: MockScopeHeaders): void {
  demoScopes().release(scopeHeaders(headers))
}
