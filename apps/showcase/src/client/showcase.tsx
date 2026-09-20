"use client"

import type { AppSnapshot } from "@plainworks/app"
import { AppProvider, type ClientCapability } from "@plainworks/app/client"
import type { HttpClient } from "@plainworks/http"
import type { DehydratedState } from "@plainworks/query"
import { HydrationBoundary } from "@plainworks/query/client"
import type { ReactElement } from "react"
import { HttpClientProvider } from "./http-client"
import { RouterProvider } from "./router"
import { AppShell } from "./shell"

/** Everything the shared render root needs, built per request on the server and once in the browser. */
export interface ShowcaseProps {
  /** The client capability registry (query, theme, scopes) handed to `AppProvider`. */
  readonly capabilities: readonly ClientCapability[]
  /** The server-resolved snapshot each capability hydrates from. */
  readonly snapshot: AppSnapshot
  /** The dehydrated query cache the `HydrationBoundary` rehydrates so the list needs no refetch. */
  readonly dehydratedState: DehydratedState
  /** The path the server rendered, so the first client render matches (no hydration mismatch). */
  readonly initialPath: string
  /** The request-scoped HTTP client the sections read and mutate through. */
  readonly httpClient: HttpClient
}

/**
 * The one render root both the server (`renderToString`) and the client (`hydrateRoot`) render, so
 * the two trees cannot drift. Providers are composed through the kernel: `AppProvider` mounts the
 * capability registry (query outermost), inside which the query cache is rehydrated, the HTTP
 * client is provided to the sections, and the router owns client-side navigation.
 */
export function Showcase(props: ShowcaseProps): ReactElement {
  return (
    <AppProvider capabilities={props.capabilities} snapshot={props.snapshot}>
      <HydrationBoundary state={props.dehydratedState}>
        <HttpClientProvider client={props.httpClient}>
          <RouterProvider initialPath={props.initialPath}>
            <AppShell />
          </RouterProvider>
        </HttpClientProvider>
      </HydrationBoundary>
    </AppProvider>
  )
}
