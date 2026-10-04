"use client"

import { createAllowListPolicy, requireClaim } from "@plainworks/auth/authz"
import { createAuthGates, createSessionContext } from "@plainworks/auth/client"
import { hasName } from "../../neutral/auth"

// Re-exported so client components gate on the same named-identity rule the server authorizer uses.
export { hasName }

// One shared session React context for the app: the auth client capability mounts its `Provider`
// over the root-owned runtime (seeded with the server-resolved snapshot, so no flash), and the
// account bar reads it. Module-level like any React context — the runtime itself is built per
// request on the server and once by the browser root, so concurrent SSR requests stay isolated.
export const session = createSessionContext()
export const { SessionProvider, useSession, useIdentity, useIsAuthenticated, useSessionRuntime } =
  session

// The client authorization gates bound to the shared session — `RequireAuth` for a whole subtree,
// `Can` for a single decision. UX affordances only; the server session gate is the real boundary.
export const { RequireAuth, Can } = createAuthGates(session)

const requiresName = requireClaim("name", hasName)

// Default-deny policies over that one rule. Both read the same predicate, so a change to who may
// manage tasks is made in exactly one place.
export const canManageAccount = createAllowListPolicy({ rules: [requiresName] })
export const canManageTasks = createAllowListPolicy({ rules: [requiresName] })

// The same named-identity rule gates advancing an order's status — a signed-in operator may, a
// guest may only browse.
export const canManageOrders = createAllowListPolicy({ rules: [requiresName] })

// And the same rule gates acting on the notifications feed — a signed-in user may mark read,
// dismiss, and mark all read; a guest may only read the feed.
export const canManageNotifications = createAllowListPolicy({ rules: [requiresName] })
