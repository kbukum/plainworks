"use client"

import "./styles.css"

import { deserializeSnapshot } from "@plainworks/app"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, type DehydratedState } from "@plainworks/query"
import { hydrateRoot } from "react-dom/client"
import { QUERY_STATE_SCRIPT_ID, ROOT_ELEMENT_ID, SNAPSHOT_SCRIPT_ID } from "../app/constants"
import { buildClientCapabilities } from "./capabilities"
import { createShowcaseDevtoolsSeams, type ShowcaseDevtoolsSeams } from "./dev-tools/seams"
import { Showcase } from "./showcase"
import { createThemeSource } from "./sources"

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

  // The development inspector is reached only inside `import.meta.env.DEV` blocks, so the flag
  // folding to `false` tree-shakes it — and every devtools chunk and its CSS — out of the
  // production bundle (`check-production` proves it). The side-effect-free HTTP seam is imported
  // statically because its interceptor must wrap the client at construction, and awaiting it would
  // delay hydration past `load`. The inspector is optional: a failure is reported and the app
  // hydrates uninstrumented, and the shell mounts only after hydration.
  let devtools: ShowcaseDevtoolsSeams | undefined
  if (import.meta.env.DEV) {
    try {
      devtools = createShowcaseDevtoolsSeams()
    } catch (error) {
      console.error("Development inspector failed to start; continuing without it.", error)
    }
  }

  // One query client and one theme source — built once at startup for the browser (never a
  // module-level singleton), mirroring the per-request build on the server. The HTTP client reads
  // the app's own origin, so every `/api/*` read lands on the backend the SSR prefetch used.
  const queryClient = createQueryClient()
  const themeSource = createThemeSource()
  const httpClient = createHttpClient(
    devtools
      ? { baseUrl: window.location.origin, interceptors: [devtools.http.interceptor] }
      : { baseUrl: window.location.origin },
  )
  const capabilities = buildClientCapabilities({ queryClient, themeSource })

  hydrateRoot(
    root,
    <Showcase
      capabilities={capabilities}
      snapshot={snapshot}
      dehydratedState={dehydratedState}
      initialPath={window.location.pathname}
      httpClient={httpClient}
    />,
  )

  if (import.meta.env.DEV && devtools !== undefined) {
    const seams = devtools
    let active = true
    let dispose: (() => void) | undefined
    import.meta.hot?.dispose(() => {
      active = false
      dispose?.()
    })
    import("./dev-tools/mount")
      .then(({ mountShowcaseDevtools }) => {
        if (!active) return
        dispose = mountShowcaseDevtools({
          seams,
          httpClient,
          queryClient,
          origin: window.location.origin,
        })
      })
      .catch((error: unknown) => {
        console.error("Development inspector failed to mount.", error)
      })
  }
}

hydrate()
