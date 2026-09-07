---
"@plainworks/connect": patch
---

Add `@plainworks/connect` (L2) — a host-independent Connect-RPC (Connect-ES v2) integration. The server-safe `.` entry (transport factory, interceptors, typed error, neutral connect-query bindings) references no host global; the React hooks live at a DOM-free `./client` entry.

`createConnectRpcTransport` is a per-context **factory** (no module singleton) that builds a Connect-Web transport with the kit's conventions and delegates all resilience to `std`:

- **Protocol** — Connect over plain `fetch` by default, or gRPC-Web via `protocol: "grpc-web"`. Native gRPC (Node-only HTTP/2) is deliberately deferred so the neutral entry stays host-independent.
- **Resilience from `std`** — a per-attempt `withTimeout` budget plus bounded, jittered, idempotent-only retry/backoff; idempotency is derived from the method's proto declaration, so a write is never auto-retried. A streaming call is not retried but is bounded by an **idle timeout** — a gap longer than `timeoutMs` between messages aborts the underlying stream and fails `deadline_exceeded`, with the source iterator always torn down.
- **Interceptor order** — `resilience → caller interceptors → auth → origin guard`, outermost-first, so a retry re-runs the whole chain and re-injects a refreshed credential. Auth is header-only (non-mutating, so a credential never lingers onto a later attempt); a token never lands in a URL. The innermost origin guard, bound to `baseUrl`, refuses to send a credential once an interceptor has rewritten the URL across origins.
- **Typed errors** — `mapConnectError` maps a `ConnectError` to a typed `RpcError` (`connect/${code}`) at the boundary only, preserving the cause; `RpcError.details` are raw/undecoded.
- **Query conventions** — `createQueryKey` (finite, deterministic, transport-scoped) and `createInvalidator` (prefix-matches finite + infinite queries), over `@connectrpc/connect-query-core` (React-free).
