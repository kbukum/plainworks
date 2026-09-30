"use client"

import type { AppSnapshot } from "@plainworks/app"
import { AppProvider, type ClientCapability } from "@plainworks/app/client"
import { HydrationBoundary } from "@plainworks/query/client"
import type { DehydratedState } from "@plainworks/query/hydration"
import type { ReactElement } from "react"
import { RouterProvider } from "../router"
import { ShowcaseShell } from "../shell"
import { ToastHost } from "./toast-host"

/** Everything the shared render root needs, built per request on the server and once in the browser. */
export interface ShowcaseProps {
  /** The client capability registry (query, http, theme, motion, auth, scopes) for `AppProvider`. */
  readonly capabilities: readonly ClientCapability[]
  /** The server-resolved snapshot each capability hydrates from. */
  readonly snapshot: AppSnapshot
  /** The dehydrated query cache the `HydrationBoundary` rehydrates so the list needs no refetch. */
  readonly dehydratedState: DehydratedState | undefined
  /** The path the server rendered, so the first client render matches (no hydration mismatch). */
  readonly initialPath: string
}

/**
 * The one render root both the streaming server renderer and `hydrateRoot` render, so the two trees
 * cannot drift. Providers are composed through the kernel: `AppProvider` mounts the capability
 * registry (query outermost), inside which the query cache is rehydrated, the router owns
 * client-side navigation, and the app-wide toast host is mounted so any surface can raise feedback.
 */
export function Showcase(props: ShowcaseProps): ReactElement {
  return (
    <AppProvider capabilities={props.capabilities} snapshot={props.snapshot}>
      <HydrationBoundary state={props.dehydratedState}>
        <RouterProvider initialPath={props.initialPath}>
          <ToastHost>
            <ShowcaseShell />
          </ToastHost>
        </RouterProvider>
      </HydrationBoundary>
    </AppProvider>
  )
}
