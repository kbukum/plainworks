// The server-side authorization boundary for order writes. The client `<Can>` gate only hides the
// status control as a UX affordance; this seam is the real boundary the mock backend enforces, so a
// caller cannot PATCH an order by hitting `/api/orders/*` directly. It verifies the signed session
// cookie the BFF issued and applies the same named-identity policy as the `<Can>` gate — a guest,
// or a forged, tampered, or expired cookie, is rejected with 403. Neutral and server-safe: it reads
// only the request `Cookie` header and names no host global.

import type { MutationAuthorizer } from "@plainworks/mocks"
import type { ReadShowcaseSession } from "./auth"
import { hasName } from "./identity-policy"

/**
 * Build the order-write authorizer over a verified session reader. A mutation is allowed only when
 * the request carries a session cookie that verifies under the signing key *and* whose identity
 * satisfies the order-management policy (a named identity) — mirroring `canManageOrders` at the
 * server boundary so the client gate stays a UX affordance, never the authorization. Presence of
 * the cookie name is not enough: an unsigned or forged value fails verification and is denied.
 */
export function createOrderMutationAuthorizer(read: ReadShowcaseSession): MutationAuthorizer {
  return async (request) => {
    const session = await read(request.headers.get("cookie") ?? "")
    return session.authenticated && hasName(session.name)
  }
}
