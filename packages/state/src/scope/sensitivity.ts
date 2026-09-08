import type { StateCapabilities } from "@plainworks/std"
import { StateConfigError } from "../errors"
import type { Scope } from "./scope"

/**
 * A field's sensitivity class. `"secret"` marks a value that must never reach untrusted client
 * storage — the composer refuses to place it anywhere but a memory-equivalent scope. Omitting it (the
 * default) treats the value as ordinary non-secret UI state.
 */
export type Sensitivity = "secret"

/**
 * Only a **memory-equivalent** scope may hold a secret: the value must be client-authoritative, must
 * not survive a reload, must not be transmitted to the server, must not be shared across tabs, and
 * must be readable without a host (`availableAtImport`) — the last axis is what isolates in-process
 * `memory` from `url`, which is otherwise transient/local yet still world-visible in the address bar.
 * Together they admit only the in-memory access-token fallback; every persisted/cookie/url/session
 * scope reaches storage a script, the server, or a bystander can read.
 */
export function isMemoryEquivalent(capabilities: StateCapabilities): boolean {
  return (
    capabilities.authority === "local" &&
    capabilities.availableAtImport &&
    !capabilities.durable &&
    !capabilities.sentToServer &&
    !capabilities.sharedAcrossTabs
  )
}

/**
 * The **capability-driven** secret guard, run at construction (never per request, never a scope-name
 * check): reject a `sensitivity: "secret"` value placed in any scope whose capabilities are not
 * memory-equivalent. This closes the door on a token landing in `localStorage`/a cookie/the URL —
 * secure token custody is auth's server-owned `__Host-` `HttpOnly` cookie, not a client scope.
 *
 * It is host-neutral (capabilities only), so it is reused by both the client scoped composer and
 * `@plainworks/auth`'s in-memory TMB access-token fallback — one guard, no bespoke re-check.
 */
export function assertScopeAllowsSensitivity(
  label: string,
  scope: Scope,
  sensitivity: Sensitivity | undefined,
): void {
  if (sensitivity !== "secret") {
    return
  }
  if (isMemoryEquivalent(scope.capabilities)) {
    return
  }
  throw new StateConfigError(
    `Secret ${label} cannot live in the "${scope.name}" scope: a secret may only be held by a ` +
      "memory-equivalent scope (not durable, not sent to the server, not shared across tabs). Every " +
      "other scope reaches storage a script or the server can read — use auth's server-owned " +
      "__Host- HttpOnly custody for tokens and secrets.",
  )
}
