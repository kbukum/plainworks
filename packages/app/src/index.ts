// Server-safe public entry for `@plainworks/app` — the composition kernel. Re-export-only barrel
// (no logic here; implementation lives in concern-named modules under `./kernel`). No React or DOM
// imports, so the `.` entry runs anywhere (Node, edge, workers, RSC, React Native): it builds the
// per-request app value, orders the injected capability registry (the canonical composition idiom),
// and runs the zero-flash SSR resolve→serialize→hydrate contract as plain data. The `"use client"`
// React binding — `AppProvider`, hooks, the error boundary — lives in the separate `./client`
// entry; the test harness in `./testing`.
export { AppConfigError, AppContextError } from "./errors"
export type {
  AnyCapability,
  App,
  AppConfig,
  AppSnapshot,
  Awaitable,
  Capability,
  CapabilityResolveContext,
  OrderedNode,
} from "./kernel"
export {
  createApp,
  defineCapability,
  deserializeSnapshot,
  EMPTY_SNAPSHOT,
  orderCapabilities,
  resolveCapabilities,
  serializeSnapshot,
  snapshotFor,
} from "./kernel"
