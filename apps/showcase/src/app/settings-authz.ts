// The server-side authorization boundary for settings requests. Both reads and writes verify the
// signed session cookie and bind the requested `userId` to its subject. Writes additionally require
// a named identity and a non-simple request header, preventing a cross-origin form POST from riding
// the session cookie into the endpoint.

import type { SettingsRequestAuthorizer } from "@plainworks/demo"
import type { ReadShowcaseSession } from "./auth"
import { SETTINGS_MUTATION_HEADER, SETTINGS_MUTATION_HEADER_VALUE } from "./constants"
import { hasName } from "./identity-policy"

/**
 * Build the settings-write authorizer over a verified session reader. A write is allowed only when
 * the request carries the non-simple mutation header, a session cookie that verifies under the
 * signing key whose identity satisfies the manage policy (a named identity), *and* a `userId`
 * addressing that same identity — so the boundary both authenticates the caller and scopes the
 * write to their own settings. A guest, a forged/tampered/expired cookie, a missing header, or a
 * request for another user's record is denied.
 */
async function ownsSettingsRecord(
  request: Request,
  read: ReadShowcaseSession,
  requireName: boolean,
): Promise<boolean> {
  const session = await read(request.headers.get("cookie") ?? "")
  if (!session.authenticated || (requireName && !hasName(session.name))) {
    return false
  }
  return new URL(request.url).searchParams.get("userId") === session.subject
}

/** Authorize an authenticated identity to read only its own settings record. */
export function createSettingsReadAuthorizer(read: ReadShowcaseSession): SettingsRequestAuthorizer {
  return (request) => ownsSettingsRecord(request, read, false)
}

export function createSettingsMutationAuthorizer(
  read: ReadShowcaseSession,
): SettingsRequestAuthorizer {
  return async (request) => {
    if (request.headers.get(SETTINGS_MUTATION_HEADER) !== SETTINGS_MUTATION_HEADER_VALUE) {
      return false
    }
    return ownsSettingsRecord(request, read, true)
  }
}
