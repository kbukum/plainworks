// The server-side authorization boundary for settings requests. Both reads and writes resolve the
// opaque session cookie against the server session store and bind the requested `userId` to its
// subject. Writes additionally require a named identity and a non-simple request header,
// preventing a cross-origin form POST from riding the session cookie into the endpoint.

import type { SettingsRequestAuthorizer } from "@plainworks/demo"
import type { ReadShowcaseSession } from "../auth"
import { hasName } from "../auth"
import { SETTINGS_MUTATION_HEADER, SETTINGS_MUTATION_HEADER_VALUE } from "../constants"

/**
 * Whether the request's live session owns the addressed settings record, optionally requiring a
 * named identity. A guest or an unknown, revoked, or expired session owns nothing; a store outage
 * rejects.
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

/**
 * Authorize a write only with the non-simple mutation header, a named identity, *and* a `userId`
 * addressing that same identity — so the boundary both authenticates the caller and scopes the
 * write to their own settings.
 */
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
