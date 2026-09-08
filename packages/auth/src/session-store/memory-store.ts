import {
  assertScopeAllowsSensitivity,
  memoryScope,
  type Scope,
  stringSerializer,
} from "@plainworks/state"
import type { StateSource } from "@plainworks/std"

/** How to build the in-memory (TMB) access-token store. */
export interface MemorySessionStoreConfig {
  /**
   * The scope that holds the token; defaults to the neutral `memory` scope. Any scope passed here is
   * checked by the secret guard and rejected unless it is memory-equivalent, so the token can never
   * be routed to `localStorage`, a cookie, or the URL.
   */
  readonly scope?: Scope
  /** The value-slot key; defaults to `access-token`. */
  readonly key?: string
}

/**
 * Build the **TMB (Token-Mediating Backend) fallback** store: the short-lived access token held in
 * memory only, for a same-origin SPA that has no BFF. It composes `@plainworks/state`'s neutral
 * `memory` scope and runs `@plainworks/state`'s **secret guard** ({@link assertScopeAllowsSensitivity})
 * so the token can live *only* in a memory-equivalent scope — no bespoke store, one enforcement path.
 *
 * Refresh custody stays server-side (a same-origin refresh endpoint); a pure no-backend SPA that keeps
 * tokens in JS storage is not a supported secure topology.
 *
 * @throws {import("@plainworks/state").StateConfigError} when a non-memory-equivalent `scope` is
 * supplied — the guard refuses to place a secret anywhere a script, the server, or another tab can
 * read it.
 */
export function createMemorySessionStore(
  config: MemorySessionStoreConfig = {},
): StateSource<string> {
  const scope = config.scope ?? memoryScope
  assertScopeAllowsSensitivity("in-memory access token", scope, "secret")
  return scope.createSource<string>({
    key: config.key ?? "access-token",
    serializer: stringSerializer,
  })
}
