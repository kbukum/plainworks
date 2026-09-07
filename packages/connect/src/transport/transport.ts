import type { Interceptor, Transport } from "@connectrpc/connect"
import { createConnectTransport, createGrpcWebTransport } from "@connectrpc/connect-web"
import type { AuthHeaderProvider, Delay, RandomSource, WebFetch } from "@plainworks/std"
import type { ConnectRetryPolicy } from "../interceptor/resilience"
import { buildInterceptorChain } from "./interceptor-chain"

/** Default per-attempt timeout, matching `@plainworks/http`. */
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Browser-capable wire protocol.
 *
 * - `"connect"` — the Connect protocol over plain `fetch` (JSON or binary). The default: no proxy,
 *   directly consumable by a browser.
 * - `"grpc-web"` — the gRPC-Web protocol, for a backend fronted by a gRPC-Web proxy (e.g. Envoy).
 *
 * Native gRPC (`@connectrpc/connect-node`, HTTP/2) is intentionally **not** here: it is Node-only and
 * would pull `node:http2` into the neutral entry, breaking host-independence. It belongs in a
 * separate Node-only entry if a real need appears; both would reuse the same interceptor chain.
 */
export type ConnectProtocol = "connect" | "grpc-web"

/** Construction options for {@link createConnectRpcTransport}. */
export interface CreateConnectTransportOptions {
  /** Absolute base URL of the Connect endpoint. No default — always injected. */
  readonly baseUrl: string
  /** Wire protocol. Defaults to `"connect"`. */
  readonly protocol?: ConnectProtocol
  /**
   * Extra interceptors applied to every call, ordered outermost-first. They run **inside** the
   * resilience/retry loop and **outside** auth injection.
   */
  readonly interceptors?: readonly Interceptor[]
  /**
   * Header-only credential seam; when set, its headers are injected on every attempt (innermost,
   * closest to the wire). Prefer this over hand-placing an auth interceptor.
   */
  readonly authProvider?: AuthHeaderProvider
  /**
   * Per-attempt timeout in ms — the C1 fix: every outbound call is bounded by a `std` deadline
   * (rather than left unbounded). Defaults to 30s. For a unary call it is the per-attempt budget
   * (each retry gets a fresh deadline); for a streaming call it is the **idle timeout** between
   * messages, so a stalled stream is aborted rather than left open indefinitely. Distinct from
   * Connect's own `defaultTimeoutMs`, because a `std`-owned budget is what a retry needs.
   */
  readonly timeoutMs?: number
  /**
   * Retry policy for idempotent unary calls; when omitted, each call makes a single attempt.
   * Idempotency is derived from the method's proto declaration, never retried for a write.
   */
  readonly retry?: ConnectRetryPolicy
  /**
   * Wire format. Defaults to JSON (`false`) for debuggability; set `true` for binary protobuf on
   * production hot paths.
   */
  readonly useBinaryFormat?: boolean
  /** Override the `fetch` implementation (tests, custom credentials, SSR). */
  readonly fetch?: WebFetch
  /** Injectable delay for deterministic timeout/backoff tests; defaults to the host timer. */
  readonly delay?: Delay
  /** Injectable jitter source for deterministic retry tests; defaults to the system RNG. */
  readonly random?: RandomSource
}

/**
 * Create a Connect-Web {@link Transport} with the kit's conventions:
 *
 * - no hardcoded base URL — always injected;
 * - JSON wire format by default over the Connect protocol (or gRPC-Web via `protocol`);
 * - every unary call bounded by a per-attempt `std` timeout, with idempotent-only retry + backoff
 *   when a policy is set (all from `@plainworks/std` — connect forks no resilience logic);
 * - header-only credential injection via the shared {@link AuthHeaderProvider} seam.
 *
 * Interceptor order (outermost → innermost): resilience → caller interceptors → auth. The transport
 * is a plain value; provide it through React context via `TransportProvider` (see the `./client`
 * entry), never a module-level singleton.
 *
 * Errors surface as `ConnectError` (Connect's contract). Map them to the kit's typed `RpcError` at
 * the boundary with `mapConnectError` — never inside an interceptor, since Connect re-normalizes any
 * interceptor-thrown value back into a `ConnectError`, discarding a custom type.
 */
export function createConnectRpcTransport(options: CreateConnectTransportOptions): Transport {
  const {
    baseUrl,
    protocol = "connect",
    interceptors,
    authProvider,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retry,
    useBinaryFormat = false,
    fetch,
    delay,
    random,
  } = options

  const chain = buildInterceptorChain({
    baseUrl,
    timeoutMs,
    ...(interceptors !== undefined ? { interceptors } : {}),
    ...(authProvider !== undefined ? { authProvider } : {}),
    ...(retry !== undefined ? { retry } : {}),
    ...(delay !== undefined ? { delay } : {}),
    ...(random !== undefined ? { random } : {}),
  })

  const transportOptions = {
    baseUrl,
    useBinaryFormat,
    interceptors: chain,
    ...(fetch !== undefined ? { fetch } : {}),
  }

  return protocol === "grpc-web"
    ? createGrpcWebTransport(transportOptions)
    : createConnectTransport(transportOptions)
}
