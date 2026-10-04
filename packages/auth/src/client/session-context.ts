"use client"

import type { Identity } from "@plainworks/std/seam"
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react"
import type { AuthStore, SessionSnapshot } from "../session"

export interface SessionProviderProps {
  /** The root-owned lifecycle this subtree and its protected transports borrow. */
  readonly runtime: AuthStore
  readonly children: ReactNode
}

export interface SessionContext {
  readonly SessionProvider: (props: SessionProviderProps) => ReactNode
  readonly useSession: () => SessionSnapshot
  readonly useIdentity: () => Identity | null
  readonly useIsAuthenticated: () => boolean
  /** Live lifecycle used by transport composition and login/logout controls. */
  readonly useSessionRuntime: () => AuthStore
}

/**
 * The browser root's single owner of a session lifecycle: the authoritative status check once
 * mounted, and `close` on teardown. `close` is not terminal, so React's development effect replay
 * simply checks again. Call it once where the runtime is created; providers only borrow.
 */
export function useSessionOwner(runtime: AuthStore): void {
  useEffect(() => {
    void runtime.confirm().catch(() => {})
    return () => runtime.close()
  }, [runtime])
}

/** A typed context whose provider exposes a borrowed runtime; it never creates or closes one. */
export function createSessionContext(): SessionContext {
  const context = createContext<AuthStore | null>(null)

  function SessionProvider({ runtime, children }: SessionProviderProps): ReactNode {
    return createElement(context.Provider, { value: runtime, children })
  }

  function useSessionRuntime(): AuthStore {
    const runtime = useContext(context)
    if (runtime === null) throw new Error("SessionProvider is required")
    return runtime
  }

  function useSession(): SessionSnapshot {
    const runtime = useSessionRuntime()
    return useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  }

  return {
    SessionProvider,
    useSession,
    useSessionRuntime,
    useIdentity: () => useSession().identity,
    useIsAuthenticated: () => useSession().status === "authenticated",
  }
}
