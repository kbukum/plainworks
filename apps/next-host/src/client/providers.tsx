"use client"

import type { AppSnapshot } from "@plainworks/app"
import { AppProvider } from "@plainworks/app/client"
import type { ChannelOptions } from "@plainworks/channel"
import { createQueryClient } from "@plainworks/query"
import dynamic from "next/dynamic"
import { type ComponentType, type ReactElement, type ReactNode, useState } from "react"
import { AppShell } from "./app-shell"
import { buildClientCapabilities } from "./capabilities"
import type { DevtoolsMountProps } from "./dev-tools/devtools-mount"
import { createDevtoolsSeams, type DevtoolsSeams } from "./dev-tools/seams"
import { HttpClientProvider } from "./http-client"
import { createDemoTransport, LiveChannelProvider, LiveTaskSink } from "./live-stream"
import { createLiveTasksSource, createThemeSource } from "./sources"

// Reached only through a production-folded dynamic import, so a production build emits neither this
// component nor the shell chunk it loads. A load failure is reported and renders nothing.
const DevtoolsMount: ComponentType<DevtoolsMountProps> | null =
  process.env.NODE_ENV === "production"
    ? null
    : dynamic(
        () =>
          import("./dev-tools/devtools-mount").then(
            (module) => module.DevtoolsMount,
            (error: unknown) => {
              console.error("Development inspector failed to load.", error)
              return () => null
            },
          ),
        { ssr: false },
      )

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
 *
 * In development it also composes the embedded inspector: the instrumentation seams are built
 * behind a `process.env.NODE_ENV` gate the production bundler eliminates, then woven into the HTTP
 * client and channel before either is constructed. `DevtoolsMount` loads behind the same gate and
 * loads the shell lazily in turn, so a production build carries no devtools code
 * (`check-production` proves it). The inspector is optional: if it fails to start, the app runs
 * uninstrumented.
 */
export function Providers({ snapshot, origin, children }: ProvidersProps): ReactElement {
  const [seams] = useState((): DevtoolsSeams | undefined => {
    if (process.env.NODE_ENV === "production") return undefined
    try {
      return createDevtoolsSeams()
    } catch (error) {
      console.error("Development inspector failed to start; continuing without it.", error)
      return undefined
    }
  })
  const [queryClient] = useState(() => createQueryClient())
  const [themeSource] = useState(() => createThemeSource())
  const [liveSource] = useState(() => createLiveTasksSource())
  const [transport] = useState(() => createDemoTransport())
  const [capabilities] = useState(() => buildClientCapabilities({ queryClient, themeSource }))
  const [channelOptions] = useState<ChannelOptions>(() => {
    const base: ChannelOptions = { transport }
    return seams ? seams.channel.instrument(base) : base
  })

  return (
    <AppProvider capabilities={capabilities} snapshot={snapshot}>
      <HttpClientProvider
        origin={origin}
        {...(seams ? { interceptors: [seams.http.interceptor] } : {})}
      >
        <LiveChannelProvider options={channelOptions}>
          <LiveTaskSink source={liveSource}>
            <AppShell liveSource={liveSource}>{children}</AppShell>
            {DevtoolsMount !== null && seams !== undefined ? <DevtoolsMount seams={seams} /> : null}
          </LiveTaskSink>
        </LiveChannelProvider>
      </HttpClientProvider>
    </AppProvider>
  )
}
