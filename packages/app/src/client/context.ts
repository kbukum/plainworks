"use client"

import { createContext, createElement, type ReactNode, useContext } from "react"
import { AppContextError } from "../errors"
import type { AppSnapshot } from "../kernel/snapshot"

/** What the {@link import("./provider").AppProvider} publishes to the subtree — the request snapshot. */
interface AppContextValue {
  readonly snapshot: AppSnapshot
}

// Nullable so a read outside the Provider is a typed error, not a silent empty snapshot. No
// module-level value is created here — it is supplied per render by the Provider.
const AppContext = createContext<AppContextValue | null>(null)

/** Props for {@link AppContextProvider}. */
export interface AppContextProviderProps {
  readonly snapshot: AppSnapshot
  readonly children: ReactNode
}

/** Publish the per-request snapshot to the subtree. Internal to {@link import("./provider").AppProvider}. */
export function AppContextProvider({ snapshot, children }: AppContextProviderProps): ReactNode {
  return createElement(AppContext.Provider, { value: { snapshot }, children })
}

function useAppContext(hook: string): AppContextValue {
  const value = useContext(AppContext)
  if (value === null) {
    throw new AppContextError(`${hook} must be called inside <AppProvider>.`)
  }
  return value
}

/** Read the whole server-resolved {@link AppSnapshot}; empty when nothing resolved on the server. */
export function useAppSnapshot(): AppSnapshot {
  return useAppContext("useAppSnapshot").snapshot
}
