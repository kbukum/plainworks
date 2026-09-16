import type { AuthHeaders, Identity } from "@plainworks/std"
import type { AuthAdapter, AuthAdapterDeps, AuthenticateRequest } from "../adapter"
import { APIKEY_ADAPTER_KIND, type ApiKeyAdapterConfig } from "./config"

const DEFAULT_HEADER = "X-API-Key"

/** Read the API key from the configured header — header-only, never a URL/query string. */
function keyFrom(headers: AuthHeaders | undefined, headerName: string): string | undefined {
  if (headers === undefined) {
    return undefined
  }
  const wanted = headerName.toLowerCase()
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === wanted && value.length > 0) {
      return value
    }
  }
  return undefined
}

/**
 * The stateless `apikey` adapter: it extracts a key from the configured header and delegates
 * validation to the injected {@link ApiKeyVerifier}. Key custody, lookup, and — critically —
 * **constant-time** comparison are the verifier's responsibility, not this adapter's: it only reads
 * the header and forwards the key. Use the exported `constantTimeEqual` for the compare so a
 * byte-by-byte early return cannot leak a valid key. An unknown key resolves to `null`
 * (unauthenticated); an error thrown by the verifier signals an infrastructure fault and
 * propagates, never swallowed into a silent deny. It custodies nothing, so it stays on the neutral
 * `.` entry.
 */
export function apiKeyAdapter(config: ApiKeyAdapterConfig, _deps: AuthAdapterDeps): AuthAdapter {
  const headerName = config.headerName ?? DEFAULT_HEADER
  const verify = config.verify
  return {
    id: APIKEY_ADAPTER_KIND,
    async authenticate(request: AuthenticateRequest): Promise<Identity | null> {
      const key = keyFrom(request.headers, headerName)
      if (key === undefined) {
        return null
      }
      return (await verify(key, request.signal)) ?? null
    },
  }
}
