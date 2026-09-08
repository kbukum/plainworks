import { AuthError } from "../errors"
import type { AuthAdapter, CustomAdapterConfig } from "./adapter"
import type { AuthAdapterFactory } from "./registry"

/** The registry kind under which the bring-your-own pass-through adapter registers. */
export const CUSTOM_ADAPTER_KIND = "custom"

/**
 * The trivial pass-through adapter factory: it hands back the supplied {@link AuthAdapter}
 * verbatim. A bring-your-own adapter therefore needs no bespoke factory — it plugs in through `{
 * kind: "custom", adapter }` — and the registry is exercisable without a real mechanism.
 *
 * @throws {AuthError} `auth/config` when the config carries no `adapter`.
 */
export const customAdapter: AuthAdapterFactory = (config): AuthAdapter => {
  const candidate = config as Partial<CustomAdapterConfig>
  if (candidate.adapter === undefined) {
    throw new AuthError("auth/config", "A custom auth adapter requires an { adapter } instance")
  }
  return candidate.adapter
}
