// Re-export-only barrel for the session concern: the client-safe identity snapshot and the
// token-refreshing auth store.
export type { AuthSnapshot } from "./snapshot"
export { ANONYMOUS_AUTH, authSnapshotOf, sessionSnapshotOf } from "./snapshot"
export type {
  AuthStore,
  AuthStoreConfig,
  RefreshFn,
  SessionSnapshot,
  TokenSet,
} from "./store"
export { createAuthStore } from "./store"
