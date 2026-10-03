// Server-safe public entry for `@plainworks/app`: the composition kernel every other module builds
// on. It builds the per-request app, orders the capability registry, and resolves the snapshot.
// Re-export-only barrel with no React or DOM imports, so it runs anywhere (Node, edge, workers,
// RSC, React Native). The SSR data writer and reader live on `./hydration`, the capability recipes
// on `./capabilities/*`, the React binding on `./client`, and the test harness on `./testing`.
export { AppConfigError, AppContextError } from "./errors"
export {
  createFailureHandler,
  type FailureHandlerOptions,
  type FailureOutcome,
} from "./errors/failure-handler"
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
  EMPTY_SNAPSHOT,
  orderCapabilities,
  resolveCapabilities,
  snapshotFor,
} from "./kernel"
