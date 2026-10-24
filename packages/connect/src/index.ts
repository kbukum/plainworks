// Server-safe public entry for `@plainworks/connect`: the Connect RPC transport and its typed
// error. Interceptors live on `./interceptor`, the TanStack Query bindings on `./query`, and the
// React hooks on `./client`. Re-export-only barrel. No React or DOM imports, so the `.` entry runs
// anywhere (Node, edge, workers, RSC).
export {
  decodeRpcFailure,
  isRpcError,
  mapConnectError,
  RpcError,
  type RpcErrorInit,
  type RpcFailureDecoder,
  type RpcFailureInput,
} from "./errors"
export {
  type ConnectProtocol,
  type CreateConnectTransportOptions,
  createConnectRpcTransport,
  type FailureTransportOptions,
  failureTransport,
} from "./transport"
