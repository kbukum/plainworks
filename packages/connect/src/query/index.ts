// Neutral (server-safe) Connect ↔ TanStack Query bindings. `@plainworks/connect` leans on
// connect-query-core (React-free) for the query-key/options conventions rather than reimplementing
// them, and adds the kit's finite-key + method-scoped invalidation helpers. React hooks and the
// `TransportProvider` DI context live in the `./client` entry.
export type { ConnectQueryKey } from "@connectrpc/connect-query-core"
export {
  callUnaryMethod,
  createConnectQueryKey,
  createInfiniteQueryOptions,
  createProtobufSafeUpdater,
  createQueryOptions,
  skipToken,
} from "@connectrpc/connect-query-core"
export { createInvalidator, type InvalidateOptions } from "./invalidate"
export { createQueryKey, type QueryKeyParams } from "./query-key"
