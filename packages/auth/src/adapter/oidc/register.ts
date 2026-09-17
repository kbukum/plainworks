import type { AuthRegistry } from "../registry"
import type { AuthAdapterDeps } from "../seam"
import { oidcAdapter } from "./adapter"
import { OIDC_ADAPTER_KIND, validateOidcAdapterConfig } from "./config"

/**
 * Register the OIDC Authorization Code + PKCE adapter into an injected {@link AuthRegistry} under
 * its `oidc` kind. Explicit registration (never a package-global registry) keeps the OAuth stack
 * (`oauth4webapi`/`jose`) out of any graph that does not opt in — which is why it, like
 * {@link oidcAdapter}, ships from the token-bearing `@plainworks/auth/server` entry rather than the
 * neutral `.` core.
 */
export function registerOidcAdapter(registry: AuthRegistry): void {
  registry.register(OIDC_ADAPTER_KIND, (config: unknown, deps: AuthAdapterDeps) =>
    oidcAdapter(validateOidcAdapterConfig(config), deps),
  )
}
