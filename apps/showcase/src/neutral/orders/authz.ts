// The server-side authorization boundary for order writes. The client `<Can>` gate only hides the
// status control as a UX affordance; this seam is the real boundary the mock backend enforces, so a
// caller cannot PATCH an order by hitting `/api/orders/*` directly. It resolves the opaque session
// cookie against the server session store and applies the same named-identity policy as the
// `<Can>` gate — a guest, or an unknown, revoked, or expired session, is rejected with 403. A store
// outage rejects rather than reading as a guest. Neutral and server-safe: it reads only the request
// `Cookie` header and names no host global.

import type { MutationAuthorizer } from "@plainworks/mocks/handlers"
import type { ReadShowcaseSession } from "../auth"
import { hasName } from "../auth"

/**
 * Build the order-write authorizer over the authoritative session reader. A mutation is allowed
 * only when the session cookie names a live session *and* its identity satisfies the
 * order-management policy (a named identity) — mirroring `canManageOrders` at the server boundary
 * so the client gate stays a UX affordance, never the authorization.
 */
export function createOrderMutationAuthorizer(read: ReadShowcaseSession): MutationAuthorizer {
  return async (request) => {
    const session = await read(request.headers.get("cookie") ?? "")
    return session.authenticated && hasName(session.name)
  }
}
