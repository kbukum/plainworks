// Re-export-only barrel for the remote-scope concern: the `remote` StateSource scope that routes a
// server-owned value through the TanStack cache. No logic here.
export type { RemoteScopeOptions } from "./scope"
export { createRemoteScope } from "./scope"
export { createRemoteSource, REMOTE_CAPABILITIES } from "./source"
