"use client"

import type { AppSnapshot } from "@plainworks/app"
import { AppProvider } from "@plainworks/app/client"
import type { ChannelOptions } from "@plainworks/channel"
import { type DevtoolsLauncher, launchDevtools } from "@plainworks/devtools/launch"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient } from "@plainworks/query"
import dynamic from "next/dynamic"
import { type ComponentType, type ReactElement, type ReactNode, useState } from "react"
import type { DevtoolsMountProps } from "../dev-tools/devtools-mount"
import { createDemoTasks, LiveChannelProvider, LiveTaskSink } from "../live"
import { HostShell } from "../shell"
import { buildClientCapabilities } from "./capabilities"
import { createLiveTasksSource, createThemeSource } from "./sources"

// Reached only through a production-folded dynamic import, so a production build emits neither this
// component nor the shell chunk it loads. A load failure is reported and renders nothing.
const DevtoolsMount: ComponentType<DevtoolsMountProps> | null =
  process.env.NODE_ENV === "production"
    ? null
    : dynamic(
        () =>
          import("../dev-tools/devtools-mount").then(
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
 * way a consumer does — the capability registry (query, HTTP, theme, session, scopes) under
 * `AppProvider`, and the live channel folding the demo stream into
 * state + query — then wraps the route content in the app chrome. Every store/client/source is
 * built once here via `useState` (never a module-level singleton), so a client navigation reuses
 * one stable graph.
 *
 * In development it also launches the embedded inspector behind a `process.env.NODE_ENV` gate the
 * production bundler eliminates. The launcher's seams wrap the HTTP client and channel before
 * either is built. `DevtoolsMount` loads behind the same gate and mounts the shell lazily, so a
 * production build carries no devtools code (`check-production` proves it). The inspector is
 * optional: a failure is reported and the app runs uninstrumented.
 */
export function Providers({ snapshot, origin, children }: ProvidersProps): ReactElement {
  const [devtools] = useState((): DevtoolsLauncher | undefined =>
    process.env.NODE_ENV === "production"
      ? undefined
      : launchDevtools({
          report: console.error,
          http: { instance: "api", label: "Demo API" },
          channel: { instance: "live", label: "Live tasks" },
        }),
  )
  // Built on the server-resolved origin, so SSR and hydration share one base URL.
  const [httpClient] = useState(() => {
    const seam = devtools?.http
    return createHttpClient(
      seam ? { baseUrl: origin, interceptors: [seam.interceptor] } : { baseUrl: origin },
    )
  })
  const [queryClient] = useState(() => createQueryClient())
  const [themeSource] = useState(() => createThemeSource())
  const [liveSource] = useState(() => createLiveTasksSource(queryClient))
  const [backend] = useState(() => createDemoTasks())
  const [capabilities] = useState(() =>
    buildClientCapabilities({ queryClient, httpClient, themeSource }),
  )
  const [channelOptions] = useState<ChannelOptions>(() => {
    const base: ChannelOptions = { transport: backend.transport }
    return devtools?.channel ? devtools.channel.instrument(base) : base
  })

  return (
    <AppProvider capabilities={capabilities} snapshot={snapshot}>
      <LiveChannelProvider options={channelOptions}>
        <LiveTaskSink snapshot={backend.snapshot}>
          <HostShell liveSource={liveSource}>{children}</HostShell>
          {DevtoolsMount !== null && devtools !== undefined ? (
            <DevtoolsMount launcher={devtools} />
          ) : null}
        </LiveTaskSink>
      </LiveChannelProvider>
    </AppProvider>
  )
}
