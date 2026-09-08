import { AuthError } from "../errors"
import type { AuthAdapter, AuthAdapterDeps } from "./adapter"

/**
 * Builds an {@link AuthAdapter} from an opaque, mechanism-specific config plus the injected deps.
 * `config` is `unknown` so the registry stays mechanism-agnostic; each factory narrows its own
 * config shape (a `custom` factory reads `{ adapter }`, an `oidc` factory reads issuer/client, ...).
 */
export type AuthAdapterFactory = (config: unknown, deps: AuthAdapterDeps) => AuthAdapter

/**
 * An explicit, injected registry of adapter factories keyed by mechanism name — never a package-global
 * mutable singleton or a string service-locator. A runtime is built from a registry per request, so
 * registration order and defaults are deterministic and SSR/RSC-safe.
 */
export interface AuthRegistry {
  /**
   * Register `factory` under `kind`. The **first** registration becomes the default (parity with
   * gokit `auth`), so a single-mechanism setup needs no explicit selection.
   *
   * @throws {AuthError} `auth/config` when `kind` is already registered — silent last-wins override
   * is a footgun on a security-load-bearing seam.
   */
  register(kind: string, factory: AuthAdapterFactory): void
  /**
   * Build the adapter registered under `kind`.
   *
   * @throws {AuthError} `auth/config` when no factory is registered for `kind`.
   */
  create(kind: string, config: unknown, deps: AuthAdapterDeps): AuthAdapter
  /** Whether a factory is registered for `kind`. */
  has(kind: string): boolean
  /** The kind registered first, or `undefined` when the registry is empty. */
  readonly defaultKind: string | undefined
}

/** Build an empty {@link AuthRegistry}. */
export function createAdapterRegistry(): AuthRegistry {
  const factories = new Map<string, AuthAdapterFactory>()
  let defaultKind: string | undefined

  return {
    register(kind, factory) {
      if (factories.has(kind)) {
        throw new AuthError("auth/config", `An auth adapter is already registered for '${kind}'`)
      }
      factories.set(kind, factory)
      defaultKind ??= kind
    },
    create(kind, config, deps) {
      const factory = factories.get(kind)
      if (factory === undefined) {
        throw new AuthError("auth/config", `No auth adapter is registered for '${kind}'`)
      }
      return factory(config, deps)
    },
    has: (kind) => factories.has(kind),
    get defaultKind() {
      return defaultKind
    },
  }
}
