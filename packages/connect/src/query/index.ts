// Neutral (server-safe) Connect ↔ TanStack Query bindings. `@plainworks/connect` leans on
// connect-query-core (React-free) for the query-key/options conventions rather than reimplementing
// them, and adds the kit's finite-key + method-scoped invalidation helpers. React hooks and the
// `TransportProvider` DI context live in the `./client` entry.
export type { ConnectQueryKey } from "@connectrpc/connect-query-core"
export {
  callUnaryMethod,
  createConnectQueryKey,
  createProtobufSafeUpdater,
  skipToken,
} from "@connectrpc/connect-query-core"
export { createInfiniteQueryOptions } from "./infinite-options"
export {
  createMethodInvalidator,
  type MethodInvalidateOptions,
  type MethodInvalidator,
} from "./invalidate"
export { createQueryKey, type QueryKeyParams } from "./query-key"
export { createQueryOptions } from "./rpc-options"
