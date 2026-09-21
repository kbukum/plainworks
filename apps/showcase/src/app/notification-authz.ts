// The server-side authorization boundary for notification writes. The client `<Can>` gate only
// hides the act-on controls as a UX affordance; this seam is the real boundary the mock backend
// enforces, so a caller cannot mark-read, dismiss, or mark-all-read by hitting the endpoints
// directly. It verifies the signed session cookie the BFF issued and applies the same named-
// identity policy as the `<Can>` gate — a guest, or a forged, tampered, or expired cookie, is
// rejected with 403. It also requires a non-simple request header, preventing a cross-origin form
// POST from riding the session cookie into the bodyless bulk endpoint. Neutral and server-safe: it
// reads only request headers and names no host global.

import type { MutationAuthorizer } from "@plainworks/mocks"
import type { ReadShowcaseSession } from "./auth"
import { NOTIFICATION_MUTATION_HEADER, NOTIFICATION_MUTATION_HEADER_VALUE } from "./constants"
import { hasName } from "./identity-policy"

/**
 * Build the notification-write authorizer over a verified session reader. A mutation is allowed
 * only when the request carries a session cookie that verifies under the signing key *and* whose
 * identity satisfies the manage policy (a named identity) — mirroring `canManageNotifications` at
 * the server boundary so the client gate stays a UX affordance, never the authorization. Presence
 * of the cookie name is not enough: an unsigned or forged value fails verification and is denied.
 * The non-simple mutation header also has to match, so browsers must pass a CORS preflight before
 * sending a cross-origin request with ambient cookies.
 */
export function createNotificationMutationAuthorizer(
  read: ReadShowcaseSession,
): MutationAuthorizer {
  return async (request) => {
    if (request.headers.get(NOTIFICATION_MUTATION_HEADER) !== NOTIFICATION_MUTATION_HEADER_VALUE) {
      return false
    }
    const session = await read(request.headers.get("cookie") ?? "")
    return session.authenticated && hasName(session.name)
  }
}
