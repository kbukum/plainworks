import type { AuthRegistry } from "../registry"
import type { AuthAdapterDeps } from "../seam"
import { apiKeyAdapter } from "./adapter"
import { APIKEY_ADAPTER_KIND, validateApiKeyAdapterConfig } from "./config"

/**
 * Register the stateless `apikey` adapter into an injected {@link AuthRegistry} under its `apikey`
 * kind. Explicit registration, never a package-global registry — a consumer opts the mechanism in
 * by calling this on the registry it hands to `createAuth`.
 */
export function registerApiKeyAdapter(registry: AuthRegistry): void {
  registry.register(APIKEY_ADAPTER_KIND, (config: unknown, deps: AuthAdapterDeps) =>
    apiKeyAdapter(validateApiKeyAdapterConfig(config), deps),
  )
}
