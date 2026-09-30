"use client"

import type { SessionContext } from "@plainworks/auth/client"
import { sessionSnapshotOf } from "@plainworks/auth/session"
import { createElement } from "react"
import { type ClientCapability, defineProvider } from "../../client/capability"
import { AUTH_CAPABILITY_ID } from "./resolver"

/** Options for {@link createAuthCapability}. */
export interface AuthCapabilityOptions {
  /**
   * The app's session context from `createSessionContext` in `@plainworks/auth/client`. Read the
   * session below the capability with its hooks (`useSession`, `useIdentity`) and gates.
   */
  readonly session: SessionContext
  /** The capability id; defaults to {@link AUTH_CAPABILITY_ID}. */
  readonly id?: string
  /** Ids this capability mounts inside, such as `["query"]`. */
  readonly dependsOn?: readonly string[]
}

/**
 * The client half of the auth recipe. It mounts the session provider seeded with the
 * server-resolved identity, so the first client render matches the server. A missing or malformed
 * slice counts as signed out.
 */
export function createAuthCapability(options: AuthCapabilityOptions): ClientCapability {
  const { session, id = AUTH_CAPABILITY_ID, dependsOn } = options
  return defineProvider({
    id,
    ...(dependsOn === undefined ? {} : { dependsOn }),
    provider: ({ resolved, children }) =>
      createElement(session.SessionProvider, {
        initialSnapshot: sessionSnapshotOf(resolved),
        children,
      }),
  })
}
