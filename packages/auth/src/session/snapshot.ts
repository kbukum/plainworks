import { isRecord } from "@plainworks/std"
import type { SessionSnapshot } from "./store"

/**
 * The client-safe authentication slice a server capability serializes into an app snapshot. It
 * carries identity only, never credentials.
 */
export interface AuthSnapshot {
  readonly authenticated: boolean
  readonly subject: string | null
  readonly name: string | null
}

/** The slice a request without a valid session resolves to. */
export const ANONYMOUS_AUTH: AuthSnapshot = {
  authenticated: false,
  subject: null,
  name: null,
}

/** Narrow an untrusted serialized value to an {@link AuthSnapshot}. */
export function authSnapshotOf(resolved: unknown): AuthSnapshot {
  if (
    isRecord(resolved) &&
    resolved.authenticated === true &&
    typeof resolved.subject === "string"
  ) {
    return {
      authenticated: true,
      subject: resolved.subject,
      name: typeof resolved.name === "string" ? resolved.name : null,
    }
  }
  return ANONYMOUS_AUTH
}

/** Narrow an untrusted serialized value to the session shape consumed by client bindings. */
export function sessionSnapshotOf(resolved: unknown): SessionSnapshot {
  const auth = authSnapshotOf(resolved)
  if (!auth.authenticated || auth.subject === null) {
    return { status: "unauthenticated", identity: null }
  }
  return {
    status: "authenticated",
    identity: {
      subject: auth.subject,
      claims: auth.name === null ? {} : { name: auth.name },
    },
  }
}
