// Fixture: a neutral (non-server, non-client) auth module illegally reaching into the OIDC adapter
// custody graph. This must trip `no-nonserver-into-auth-oidc`.
import { createOidcAdapter } from "./adapter/oidc/adapter"

export function leakOidc(): string {
  return createOidcAdapter()
}
