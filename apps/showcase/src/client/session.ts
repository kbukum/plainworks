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

// A named identity is the single rule that gates managing your account and your tasks: the demo
// user carries a `name` claim, a guest does not, so these affordances stay hidden by default.
export function hasName(value: unknown): boolean {
  return typeof value === "string" && value.length > 0
}

const requiresName = requireClaim("name", hasName)

// Default-deny policies over that one rule. Both read the same predicate, so a change to who may
// manage tasks is made in exactly one place.
export const canManageAccount = createAllowListPolicy({ rules: [requiresName] })
export const canManageTasks = createAllowListPolicy({ rules: [requiresName] })
