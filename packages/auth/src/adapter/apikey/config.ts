import type { Identity, WebAbortSignal } from "@plainworks/std"
import { AuthError } from "../../errors"

/** The registry kind under which the API-key adapter registers. */
export const APIKEY_ADAPTER_KIND = "apikey"

/**
 * Validate an inbound API key and resolve the caller it identifies, or `null` when the key is
 * unknown. Injected (bring-your-own) so key custody, lookup, and constant-time comparison stay the
 * consumer's responsibility — the adapter only extracts the key from a header and delegates. A
 * thrown error signals an infrastructure fault (a store outage), distinct from an unknown key.
 */
export type ApiKeyVerifier = (
  key: string,
  signal?: WebAbortSignal,
) => Identity | null | Promise<Identity | null>

/**
 * Config for the stateless `apikey` adapter. The key is read **header-only** (never a URL/query
 * string, which leaks into logs and history) and validated against the injected
 * {@link ApiKeyVerifier}. Host-neutral — it custodies nothing — so it lives on the `.` entry.
 */
export interface ApiKeyAdapterConfig {
  readonly kind: typeof APIKEY_ADAPTER_KIND
  /** The bring-your-own verifier that resolves a key to an identity. */
  readonly verify: ApiKeyVerifier
  /** Header carrying the key; defaults to `X-API-Key`. */
  readonly headerName?: string
}

/** Validate and narrow unknown input to {@link ApiKeyAdapterConfig}. */
export function validateApiKeyAdapterConfig(config: unknown): ApiKeyAdapterConfig {
  if (typeof config !== "object" || config === null) {
    throw new AuthError("auth/config", "API-key adapter config must be a non-null object")
  }
  const candidate = config as Record<string, unknown>
  if (candidate.kind !== APIKEY_ADAPTER_KIND) {
    throw new AuthError(
      "auth/config",
      `API-key adapter config kind must be "${APIKEY_ADAPTER_KIND}"`,
    )
  }
  if (typeof candidate.verify !== "function") {
    throw new AuthError("auth/config", "API-key adapter config requires a `verify` function")
  }
  if (
    candidate.headerName !== undefined &&
    (typeof candidate.headerName !== "string" || candidate.headerName.trim().length === 0)
  ) {
    throw new AuthError(
      "auth/config",
      "API-key adapter config `headerName` must be a non-empty string",
    )
  }
  return config as ApiKeyAdapterConfig
}
