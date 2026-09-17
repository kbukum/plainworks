"use client"

import type { AppSnapshot } from "@plainworks/app"
import { AppProvider } from "@plainworks/app/client"
import { createQueryClient } from "@plainworks/query"
import { type ReactElement, type ReactNode, useState } from "react"
import { AppShell } from "./app-shell"
import { buildClientCapabilities } from "./capabilities"
import { HttpClientProvider } from "./http-client"
import { createDemoTransport, LiveChannelProvider, LiveTaskSink } from "./live-stream"
import { createLiveTasksSource, createThemeSource } from "./sources"

/** Props for {@link Providers}. */
export interface ProvidersProps {
  /** The server-resolved snapshot each capability hydrates from. */
  readonly snapshot: AppSnapshot
  /** The absolute request origin, so the browser HTTP client and the RSC prefetch share a backend. */
  readonly origin: string
  readonly children: ReactNode
}

/**
 * The client composition root the RSC layout mounts once. It assembles the published surfaces the
 * way a consumer does — the capability registry (query, theme, session, scopes) under
 * `AppProvider`, the request-scoped HTTP client, and the live channel folding the demo stream into
 * state + query — then wraps the route content in the app chrome. Every store/client/source is
 * built once here via `useState` (never a module-level singleton), so a client navigation reuses
 * one stable graph.
 */
export function Providers({ snapshot, origin, children }: ProvidersProps): ReactElement {
  const [queryClient] = useState(() => createQueryClient())
  const [themeSource] = useState(() => createThemeSource())
  const [liveSource] = useState(() => createLiveTasksSource())
  const [transport] = useState(() => createDemoTransport())
  const [capabilities] = useState(() => buildClientCapabilities({ queryClient, themeSource }))

  return (
    <AppProvider capabilities={capabilities} snapshot={snapshot}>
      <HttpClientProvider origin={origin}>
        <LiveChannelProvider options={{ transport }}>
          <LiveTaskSink source={liveSource}>
            <AppShell liveSource={liveSource}>{children}</AppShell>
          </LiveTaskSink>
        </LiveChannelProvider>
      </HttpClientProvider>
    </AppProvider>
  )
}
