"use client"

import "@plainworks/devtools/styles.css"

import { mountDevtools, type SourceRendererMap } from "@plainworks/devtools/client"
import { createQuerySource } from "@plainworks/devtools/query"
import { createHttpClient, type HttpClient } from "@plainworks/http"
import { createMockControlClient } from "@plainworks/mocks"
import type { QueryClient } from "@plainworks/query"
import { MockPanel } from "./mock-panel"
import { createMockSource } from "./mock-source"
import type { ShowcaseDevtoolsSeams } from "./seams"

/** The live runtime the inspector observes, built by the host and shared with the app. */
export interface MountShowcaseDevtoolsArgs {
  readonly seams: ShowcaseDevtoolsSeams
  /** The app's HTTP client, already wrapped by `seams.http.interceptor`. */
  readonly httpClient: HttpClient
  readonly queryClient: QueryClient
  /** Origin of the demo backend's `/mock/*` control plane. */
  readonly origin: string
}

const RENDERERS: SourceRendererMap = { mock: MockPanel }

/**
 * Observe the live runtime and render the shell; return teardown. This is the only module that
 * pulls the devtools CSS and DOM, so the host loads it after hydration and only inside its
 * development gate. The custom `mock` panel proves the package's extension path — a source and
 * renderer the app owns.
 *
 * The mock source reads the control plane through its own client, not the observed one: its
 * polling is inspector plumbing and must not crowd real `/api` traffic out of the HTTP timeline.
 */
export function mountShowcaseDevtools({
  seams,
  httpClient,
  queryClient,
  origin,
}: MountShowcaseDevtoolsArgs): () => void {
  const control = createMockControlClient({ client: createHttpClient({ baseUrl: origin }) })
  const { dispose } = mountDevtools({
    sources: [
      seams.http.source,
      createQuerySource({ client: queryClient, instance: "app", label: "App cache" }),
      createMockSource({ control, client: httpClient }),
    ],
    renderers: RENDERERS,
  })
  return dispose
}
