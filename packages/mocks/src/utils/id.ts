/**
 * ID generation utilities. IDs flow into entity `id`/`userId` fields, so they use the host's Web
 * Crypto via `@plainworks/std` `randomId` rather than `Math.random` (insecure randomness in a
 * security-sensitive sink) — and reuse the canonical `std` owner instead of a bespoke generator.
 */

import { randomId } from "@plainworks/std"

/** Generate a unique id with an optional prefix (e.g. `user_a1b2c3`), via Web Crypto. */
export function generateId(prefix = ""): string {
  const id = randomId()
  return prefix ? `${prefix}_${id}` : id
}

/** Generate a unique UUID-shaped id, via Web Crypto. */
export function generateUUID(): string {
  return randomId()
}
