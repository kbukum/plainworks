"use client"

import type { AppSnapshot } from "@plainworks/app"
import { AppProvider, type ClientCapability } from "@plainworks/app/client"
import type { StreamTransportFactory } from "@plainworks/channel"
import type { HttpClient } from "@plainworks/http"
import type { DehydratedState } from "@plainworks/query"
import { HydrationBoundary } from "@plainworks/query/client"
import type { StateSource } from "@plainworks/std"
import type { ReactElement } from "react"
import { Dashboard } from "./dashboard"
import { LiveChannelProvider, LiveTaskSink, type LiveTasks } from "./live-stream"
import { RouterProvider } from "./router"

/** Everything the shared render root needs, built per request on the server and once in the browser. */
export interface ShowcaseProps {
  /** The client capability registry (query, theme, scopes) handed to `AppProvider`. */
  readonly capabilities: readonly ClientCapability[]
  /** The server-resolved snapshot each capability hydrates from — the zero-flash contract. */
  readonly snapshot: AppSnapshot
  /** The dehydrated query cache the `HydrationBoundary` rehydrates so the list needs no refetch. */
  readonly dehydratedState: DehydratedState
  /** The request-scoped typed fetch client the task query reads through. */
  readonly httpClient: HttpClient
  /** The memory slot the live stream folds task upserts into. */
  readonly liveSource: StateSource<LiveTasks>
  /** The path the server rendered, so the first client render matches (no hydration mismatch). */
  readonly initialPath: string
  /** The channel transport (a demo stream here; a real SSE/WS adapter in production). */
  readonly transport: StreamTransportFactory
}

/**
 * The one render root both the server (`renderToString`) and the client (`hydrateRoot`) render, so
 * the two trees cannot drift. Providers are composed through the kernel: `AppProvider` mounts the
 * capability registry (query outermost), inside which the query cache is rehydrated, the live
 * channel connects, and the router owns client-side navigation.
 */
export function Showcase(props: ShowcaseProps): ReactElement {
  return (
    <AppProvider capabilities={props.capabilities} snapshot={props.snapshot}>
      <HydrationBoundary state={props.dehydratedState}>
        <LiveChannelProvider options={{ transport: props.transport }}>
          <LiveTaskSink source={props.liveSource}>
            <RouterProvider initialPath={props.initialPath}>
              <Dashboard httpClient={props.httpClient} liveSource={props.liveSource} />
            </RouterProvider>
          </LiveTaskSink>
        </LiveChannelProvider>
      </HydrationBoundary>
    </AppProvider>
  )
}
