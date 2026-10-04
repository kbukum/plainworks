import { isRecord } from "@plainworks/std"
import { FailureDecodeError } from "@plainworks/std/failure"
import type { CredentialRestrictions, SessionIdentity } from "@plainworks/std/seam"
import { parseRfc3339 } from "@plainworks/std/time"
export interface SessionResponse {
  readonly status: "authenticated"
  readonly identity: SessionIdentity
  readonly expiresAt: string
  readonly csrfToken: string
}

function isStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === "string")
}

function isRestrictions(value: unknown): value is CredentialRestrictions {
  return (
    isRecord(value) &&
    (value.mode === "unrestricted" ||
      (value.mode === "restricted" && isStrings(value.resources) && isStrings(value.scopes)))
  )
}

export function isSessionIdentity(value: unknown): value is SessionIdentity {
  return (
    isRecord(value) &&
    typeof value.subject === "string" &&
    value.subject.length > 0 &&
    (value.kind === "user" || value.kind === "service") &&
    isRestrictions(value.restrictions) &&
    (value.claims === undefined || isRecord(value.claims))
  )
}

/** Validate the published gokit session response without application conversion. */
export function decodeSessionResponse(value: unknown): SessionResponse {
  if (
    !isRecord(value) ||
    value.status !== "authenticated" ||
    !isSessionIdentity(value.identity) ||
    typeof value.expiresAt !== "string" ||
    parseRfc3339(value.expiresAt) === undefined ||
    typeof value.csrfToken !== "string" ||
    value.csrfToken.length === 0 ||
    value.csrfToken.length > 256
  )
    throw new FailureDecodeError()
  return {
    status: "authenticated",
    identity: value.identity,
    expiresAt: value.expiresAt,
    csrfToken: value.csrfToken,
  }
}
