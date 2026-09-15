"use client"

import "./styles.css"

import { deserializeSnapshot } from "@plainworks/app"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, type DehydratedState } from "@plainworks/query"
import { hydrateRoot } from "react-dom/client"
import { QUERY_STATE_SCRIPT_ID, ROOT_ELEMENT_ID, SNAPSHOT_SCRIPT_ID } from "../app/constants"
import { buildClientCapabilities } from "./capabilities"
import { createDemoTransport } from "./live-stream"
import { Showcase } from "./showcase"
import { createLiveTasksSource, createThemeSource } from "./sources"

// Read a serialized `<script type="application/json">` payload the server embedded, as raw text —
// never `innerHTML`/`eval` — so the untrusted string is only ever parsed by the kit's own
// deserializers at their trust boundary.
function readEmbedded(id: string): string {
  const node = document.getElementById(id)
  if (node?.textContent == null || node.textContent.length === 0) {
    throw new Error(`Missing embedded payload #${id}; the server did not render it.`)
  }
  return node.textContent
}

function hydrate(): void {
  const root = document.getElementById(ROOT_ELEMENT_ID)
  if (root === null) {
    throw new Error(`Missing #${ROOT_ELEMENT_ID} root element.`)
  }

  const snapshot = deserializeSnapshot(readEmbedded(SNAPSHOT_SCRIPT_ID))
  // The embedded cache is untrusted text; TanStack's `hydrate` (run by `HydrationBoundary`)
  // validates it as it rehydrates, so this narrows the parsed JSON to the shape that boundary owns.
  const dehydratedState = JSON.parse(readEmbedded(QUERY_STATE_SCRIPT_ID)) as DehydratedState

  // One query client, one http client, one theme source, one live slot — built once at startup for
  // the browser (never a module-level singleton), mirroring the per-request build on the server.
  const queryClient = createQueryClient()
  const httpClient = createHttpClient({ baseUrl: window.location.origin })
  const themeSource = createThemeSource()
  const liveSource = createLiveTasksSource()
  const capabilities = buildClientCapabilities({ queryClient, themeSource })

  hydrateRoot(
    root,
    <Showcase
      capabilities={capabilities}
      snapshot={snapshot}
      dehydratedState={dehydratedState}
      httpClient={httpClient}
      liveSource={liveSource}
      initialPath={window.location.pathname}
      transport={createDemoTransport()}
    />,
  )
}

hydrate()
