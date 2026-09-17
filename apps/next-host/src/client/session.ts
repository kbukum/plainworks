"use client"

import { createAllowListPolicy, requireClaim } from "@plainworks/auth"
import { createAuthGates, createSessionContext } from "@plainworks/auth/client"

// One shared session React context for the app: the auth client capability seeds its `Provider`
// with the server-resolved snapshot (zero-flash, matching the SSR gate), and the account bar reads
// it. Module-level like any React context — the session store itself is still built per mount
// inside the Provider, so concurrent SSR requests stay isolated.
const session = createSessionContext()
export const { SessionProvider, useSession, useIdentity, useIsAuthenticated } = session

// The client authorization gates bound to the shared session — `RequireAuth` for a whole subtree,
// `Can` for a single decision. UX affordances only; the server session gate is the real boundary.
export const { RequireAuth, Can } = createAuthGates(session)

// A default-deny policy: only a caller whose identity carries a name may manage their account. The
// demo user has one; a guest does not, so the affordance is hidden by default.
export const canManageAccount = createAllowListPolicy({
  rules: [requireClaim("name", (value) => typeof value === "string" && value.length > 0)],
})
