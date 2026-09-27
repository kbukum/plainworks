import "server-only"

// The dev mock backend for the running host. Unlike the kit's per-request stores, this is a single
// shared instance — it *is* the external system the app talks to, so its seeded fixtures persist
// across requests the way a real backend would. Built lazily on first use, never at import time.
//
// Dev-only note: This in-process backend is a single-process development adapter. In a
// multi-instance, worker, or serverless deployment, replace this catch-all route handler with calls
// to your real API origin or shared durable storage.

import { systemClock } from "@plainworks/std"
import { manualClock } from "@plainworks/testkit"
import { createDemoBackend, type DemoBackend } from "./mock-dispatch"

let backend: DemoBackend | undefined

/**
 * The host's shared demo backend, created on first request. `PLAINWORKS_FIXED_NOW` pins its clock
 * to one ISO-8601 instant, so the browser gate sees the same fixture dates on every run.
 */
export function demoBackend(): DemoBackend {
  const fixedNow = process.env.PLAINWORKS_FIXED_NOW
  backend ??= createDemoBackend({
    seed: 7,
    clock: fixedNow === undefined ? systemClock : manualClock(fixedNow),
  })
  return backend
}
