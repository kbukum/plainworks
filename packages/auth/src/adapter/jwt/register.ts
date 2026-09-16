import type { AuthAdapterDeps } from "../adapter"
import type { AuthRegistry } from "../registry"
import { jwtAdapter } from "./adapter"
import { JWT_ADAPTER_KIND, validateJwtAdapterConfig } from "./config"

/**
 * Register the stateless `jwt` bearer-verifier adapter into an injected {@link AuthRegistry} under
 * its `jwt` kind. Explicit registration, never a package-global registry — a consumer opts the
 * mechanism in by calling this on the registry it hands to `createAuth`.
 */
export function registerJwtAdapter(registry: AuthRegistry): void {
  registry.register(JWT_ADAPTER_KIND, (config: unknown, deps: AuthAdapterDeps) =>
    jwtAdapter(validateJwtAdapterConfig(config), deps),
  )
}
