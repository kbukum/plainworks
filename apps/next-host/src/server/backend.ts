import "server-only"

// The dev mock backend for the running host. Unlike the kit's per-request stores, this is a single
// shared instance — it *is* the external system the app talks to, so its seeded fixtures persist
// across requests the way a real backend would. Built lazily on first use, never at import time.
//
// Dev-only note: This in-process backend is a single-process development adapter. In a
// multi-instance, worker, or serverless deployment, replace this catch-all route handler with calls
// to your real API origin or shared durable storage.

import { createDemoBackend, type DemoBackend } from "./mock-dispatch"

let backend: DemoBackend | undefined

/** The host's shared demo backend, created on first request. */
export function demoBackend(): DemoBackend {
  backend ??= createDemoBackend({ seed: 7 })
  return backend
}
