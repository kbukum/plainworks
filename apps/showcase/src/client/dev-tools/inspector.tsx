"use client"

import "@plainworks/devtools/styles.css"
import "./overlay-inset.css"

import { mountDevtools, type SourceRendererMap } from "@plainworks/devtools/client"
import type { DevtoolsInspector } from "@plainworks/devtools/launch"
import { createHttpClient, type HttpClient } from "@plainworks/http"
import { createMockControlClient } from "@plainworks/mocks/control"
import { MockPanel } from "./mock-panel"
import { createMockSource } from "./mock-source"

/** What the showcase inspector needs beyond the sources the launcher provides. */
export interface ShowcaseInspectorArgs {
  /** The app's HTTP client, already wrapped by the launcher's interceptor. */
  readonly httpClient: HttpClient
  /** Origin of the demo backend's `/mock/*` control plane. */
  readonly origin: string
}

const RENDERERS: SourceRendererMap = { mock: MockPanel }

/**
 * The showcase inspector: the launcher's sources plus the app-owned `mock` source and panel, which
 * prove the package's extension path. This is the only module that pulls the devtools CSS and DOM
 * (and maps the devtools insets onto the app's overlay insets), so the launcher loads it after
 * hydration and only inside the host's development gate.
 *
 * The mock source reads the control plane through its own client, not the observed one: its polling
 * is inspector plumbing and must not crowd real `/api` traffic out of the HTTP timeline.
 */
export function createShowcaseInspector({
  httpClient,
  origin,
}: ShowcaseInspectorArgs): DevtoolsInspector {
  return ({ sources }) => {
    const control = createMockControlClient({ client: createHttpClient({ baseUrl: origin }) })
    return mountDevtools({
      sources: [...sources, createMockSource({ control, client: httpClient })],
      renderers: RENDERERS,
    })
  }
}
