"use client"

import { createAllowListPolicy, requireClaim } from "@plainworks/auth/authz"
import { createAuthGates, createSessionContext } from "@plainworks/auth/client"

// One shared session React context for the app: the auth client capability mounts its `Provider`
// over the root-owned runtime (seeded with the server-resolved snapshot, so no flash), and the
// account bar reads it. Module-level like any React context — the runtime itself is built per
// mount in the composition root, so concurrent SSR requests stay isolated.
export const session = createSessionContext()
export const { SessionProvider, useSession, useIdentity, useIsAuthenticated, useSessionRuntime } =
  session

// The client authorization gates bound to the shared session — `RequireAuth` for a whole subtree,
// `Can` for a single decision. UX affordances only; the server session gate is the real boundary.
export const { RequireAuth, Can } = createAuthGates(session)

// A default-deny policy: only a caller whose identity carries a name may manage their account. The
// demo user has one; a guest does not, so the affordance is hidden by default.
export const canManageAccount = createAllowListPolicy({
  rules: [requireClaim("name", (value) => typeof value === "string" && value.length > 0)],
})
