"use client"

import { createSessionContext } from "@plainworks/auth/client"

// One shared session React context for the app: the auth client capability seeds its `Provider`
// with the server-resolved snapshot (zero-flash, matching the SSR gate), and the account bar reads
// it. Module-level like any React context — the session store itself is still built per mount
// inside the Provider, so concurrent SSR requests stay isolated.
export const { SessionProvider, useSession, useIdentity, useIsAuthenticated } =
  createSessionContext()
