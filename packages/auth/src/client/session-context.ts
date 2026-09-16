"use client"

import { createStoreContext, type StoreContext } from "@plainworks/state/client"
import type { Identity } from "@plainworks/std"
import { createElement, type ReactNode } from "react"
import type { SessionSnapshot } from "../session"

/** Props for the {@link SessionContext.SessionProvider}. */
export interface SessionProviderProps {
  /**
   * The session snapshot the server resolved for this request, embedded in the initial HTML so the
   * first client render matches the server — the hydration path. Omit for a client-only mount,
   * which starts unauthenticated.
   */
  readonly initialSnapshot?: SessionSnapshot
  readonly children: ReactNode
}

/** A session React binding: a Provider plus the read-only session hooks. */
export interface SessionContext {
  /** Provides the hydrated session to the subtree; build it per request/render. */
  readonly SessionProvider: (props: SessionProviderProps) => ReactNode
  /** The whole client-safe snapshot (status + identity), re-rendering on session change. */
  readonly useSession: () => SessionSnapshot
  /** Just the resolved caller, or `null` when unauthenticated. */
  readonly useIdentity: () => Identity | null
  /** A boolean convenience over `status === "authenticated"`. */
  readonly useIsAuthenticated: () => boolean
}

/**
 * Create a session React binding — a `SessionProvider` that hydrates the server-resolved snapshot
 * plus the `useSession`/`useIdentity`/`useIsAuthenticated` hooks that read it. The client is handed
 * only identity and status; the access and refresh tokens never leave the server, so there is
 * nothing here to leak. DOM-free (React only), so it runs under React Native/Expo as well as the
 * browser.
 *
 * A factory, not a module-level singleton: the store is built per mount (SSR/RSC-safe), so two
 * concurrent renders never share session state.
 */
export function createSessionContext(): SessionContext {
  const context: StoreContext<SessionSnapshot> = createStoreContext<SessionSnapshot>(() => ({
    status: "unauthenticated",
    identity: null,
  }))

  function SessionProvider({ initialSnapshot, children }: SessionProviderProps): ReactNode {
    return createElement(
      context.Provider,
      initialSnapshot === undefined ? { children } : { initialState: initialSnapshot, children },
    )
  }

  return {
    SessionProvider,
    useSession: () => context.useStore(),
    useIdentity: () => context.useStore((snapshot) => snapshot.identity),
    useIsAuthenticated: () => context.useStore((snapshot) => snapshot.status === "authenticated"),
  }
}
