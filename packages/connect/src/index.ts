// Server-safe public entry for `@plainworks/connect` — a re-export-only barrel (no logic here; the
// implementation lives in concern modules). No React or DOM imports, so the `.` entry — the Connect
// transport factory, the resilience/auth interceptors, the typed error, and the neutral
// connect-query bindings — runs anywhere (Node, edge, workers, RSC). The React hooks live at the
// separate `./client` entry.

// Typed error + boundary mapper
export {
  isRpcError,
  mapConnectError,
  RpcError,
  type RpcErrorCode,
} from "./error"
// Interceptors (resilience, header-only auth, classification)
export {
  authHeaderInterceptor,
  type ConnectResilienceOptions,
  type ConnectRetryPolicy,
  isConnectRetryable,
  resilienceInterceptor,
} from "./interceptor"
// Neutral Connect ↔ TanStack Query bindings (keys, options, invalidation)
export {
  type ConnectQueryKey,
  callUnaryMethod,
  createConnectQueryKey,
  createInfiniteQueryOptions,
  createInvalidator,
  createProtobufSafeUpdater,
  createQueryKey,
  createQueryOptions,
  type InvalidateOptions,
  type QueryKeyParams,
  skipToken,
} from "./query"
// Transport factory
export {
  type ConnectProtocol,
  type CreateConnectTransportOptions,
  createConnectRpcTransport,
} from "./transport"
