import type { Interceptor } from "@connectrpc/connect"
import type { AuthHeaderProvider, Delay, RandomSource } from "@plainworks/std"
import { authHeaderInterceptor } from "../interceptor/auth-header"
import { type ConnectRetryPolicy, resilienceInterceptor } from "../interceptor/resilience"
import { originGuardInterceptor } from "./origin-guard"

/** Inputs shared by every transport variant for assembling its interceptor chain. */
export interface InterceptorChainOptions {
  /** Absolute base URL of the endpoint; bounds the innermost cross-origin credential guard. */
  readonly baseUrl: string
  /** Extra caller interceptors, ordered outermost-first. */
  readonly interceptors?: readonly Interceptor[]
  /** Header-only credential seam injected innermost (closest to the wire). */
  readonly authProvider?: AuthHeaderProvider
  /** Per-attempt timeout in ms applied by the resilience interceptor. */
  readonly timeoutMs: number
  /** Idempotent-only retry policy; omit for a single attempt. */
  readonly retry?: ConnectRetryPolicy
  /** Injectable delay for deterministic timeout/backoff tests. */
  readonly delay?: Delay
  /** Injectable jitter source for deterministic retry tests. */
  readonly random?: RandomSource
}

/**
 * Assemble the kit's interceptor chain, ordered outermost → innermost: **resilience → caller
 * interceptors → auth → origin guard**. Resilience is outermost so its retry loop re-runs the whole
 * chain (auth re-injects on every attempt); auth is innermost of the credential path so it lands
 * closest to the wire; the origin guard is placed last so it observes the final URL after every
 * interceptor rewrite and rejects a cross-origin send carrying a credential.
 *
 * This is **protocol-agnostic** on purpose — interceptors operate on Connect's `Interceptor` /
 * `ConnectError` contract, not the wire format — so it is the single shared seam reused by every
 * transport variant (Connect, gRPC-Web today; a Node-only native-gRPC entry later) with zero
 * duplication of the resilience/auth logic.
 */
export function buildInterceptorChain(options: InterceptorChainOptions): Interceptor[] {
  const { baseUrl, interceptors = [], authProvider, timeoutMs, retry, delay, random } = options
  const resilience = resilienceInterceptor({
    timeoutMs,
    ...(retry !== undefined ? { retry } : {}),
    ...(delay !== undefined ? { delay } : {}),
    ...(random !== undefined ? { random } : {}),
  })
  const chain: Interceptor[] = [resilience, ...interceptors]
  if (authProvider !== undefined) {
    chain.push(authHeaderInterceptor(authProvider))
  }
  chain.push(originGuardInterceptor(baseUrl))
  return chain
}
