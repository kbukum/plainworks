import {
  type AuthHeaderProvider,
  type Clock,
  type Delay,
  type Identity,
  systemClock,
  type WebAbortSignal,
} from "@plainworks/std"
import {
  type AuthAdapter,
  type AuthAdapterConfig,
  type AuthAdapterDeps,
  type AuthenticateRequest,
  type AuthRegistry,
  CUSTOM_ADAPTER_KIND,
  createAdapterRegistry,
  customAdapter,
} from "./adapter"
import { type AuthCrypto, defaultAuthCrypto } from "./crypto"
import { type AuthStore, createAuthStore } from "./session"

/** Options for {@link createAuth} — the explicit, per-request composition of an auth runtime. */
export interface CreateAuthConfig {
  /** The config-driven adapter selection (discriminated union; `custom` for bring-your-own). */
  readonly adapter: AuthAdapterConfig
  /**
   * The registry resolving `adapter.kind` to a factory. Defaults to a fresh registry with only the
   * `custom` pass-through registered — built-in adapters register their factories explicitly.
   */
  readonly registry?: AuthRegistry
  /** Crypto seam for the secure paths; defaults to Web Crypto. */
  readonly crypto?: AuthCrypto
  /** Time source; defaults to the system clock. */
  readonly clock?: Clock
  /** Upper bound on a single refresh. */
  readonly refreshTimeoutMs?: number
  /** Lazy-refresh leeway before absolute expiry. */
  readonly expiryLeewayMs?: number
  /** Header name for the credential; defaults to `Authorization`. */
  readonly headerName?: string
  /** Auth scheme prefix; defaults to `Bearer`. */
  readonly scheme?: string
  /** Injectable delay backing the refresh deadline — deterministic under test. */
  readonly delay?: Delay
}

/**
 * A fully-wired auth runtime: the selected adapter, the in-memory session store, and the header
 * provider a transport consumes. Built per request (no module-level singletons), so it is SSR/RSC-safe.
 */
export interface AuthRuntime {
  /** The resolved adapter driving authentication. */
  readonly adapter: AuthAdapter
  /** The in-memory session/token custody. */
  readonly session: AuthStore
  /** The `AuthHeaderProvider` a transport is injected with — never imports `auth` itself. */
  readonly getAuthHeader: AuthHeaderProvider
  /** Resolve the caller from inbound credentials. */
  authenticate(request: AuthenticateRequest): Promise<Identity | null>
  /** Clear the local session and, where supported, the provider/RP session. */
  logout(signal?: WebAbortSignal): Promise<void>
}

/**
 * Compose an {@link AuthRuntime} from an adapter selection. This is the explicit `createX({...})`
 * factory the kit uses everywhere: no import-time side effects, no shared mutable state — the
 * registry, crypto, clock, and session store are all resolved or built here, per call.
 */
export function createAuth(config: CreateAuthConfig): AuthRuntime {
  const crypto = config.crypto ?? defaultAuthCrypto()
  const clock = config.clock ?? systemClock
  const deps: AuthAdapterDeps = { crypto, clock }

  const registry = config.registry ?? defaultRegistry()
  const adapter = registry.create(config.adapter.kind, config.adapter, deps)
  const adapterRefresh = adapter.refresh?.bind(adapter)

  const session = createAuthStore({
    clock,
    ...(config.refreshTimeoutMs === undefined ? {} : { refreshTimeoutMs: config.refreshTimeoutMs }),
    ...(config.expiryLeewayMs === undefined ? {} : { expiryLeewayMs: config.expiryLeewayMs }),
    ...(config.headerName === undefined ? {} : { headerName: config.headerName }),
    ...(config.scheme === undefined ? {} : { scheme: config.scheme }),
    ...(config.delay === undefined ? {} : { delay: config.delay }),
    ...(adapterRefresh === undefined
      ? {}
      : { refresh: (signal: WebAbortSignal) => adapterRefresh(signal) }),
  })

  return {
    adapter,
    session,
    getAuthHeader: (context) => session.getAuthHeader(context),
    authenticate: (request) => adapter.authenticate(request),
    async logout(signal) {
      session.logout()
      await adapter.logout?.(signal)
    },
  }
}

/** A fresh registry seeded with only the `custom` pass-through — the safe, empty-ish default. */
function defaultRegistry(): AuthRegistry {
  const registry = createAdapterRegistry()
  registry.register(CUSTOM_ADAPTER_KIND, customAdapter)
  return registry
}
