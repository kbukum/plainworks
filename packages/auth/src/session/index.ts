// Re-export-only barrel for the session concern: the client-safe identity snapshot and the
// opaque browser session lifecycle.

export type { SessionResponse } from "./response"
export { decodeSessionResponse, isSessionIdentity } from "./response"
export type { AuthSnapshot } from "./snapshot"
export { ANONYMOUS_AUTH, authSnapshotOf, sessionSnapshotOf } from "./snapshot"
export type {
  AuthStore,
  AuthStoreConfig,
  SessionLogin,
  SessionSnapshot,
} from "./store"
export { createAuthStore } from "./store"
