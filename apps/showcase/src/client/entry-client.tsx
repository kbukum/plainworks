"use client"

import "./styles.css"

import { snapshotFor } from "@plainworks/app"
import { readHydration } from "@plainworks/app/hydration"
import { useSessionOwner } from "@plainworks/auth/client"
import { type AuthStore, createAuthStore, sessionSnapshotOf } from "@plainworks/auth/session"
import { type DevtoolsLauncher, launchDevtools } from "@plainworks/devtools/launch"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient } from "@plainworks/query"
import type { ReactElement, ReactNode } from "react"
import { hydrateRoot } from "react-dom/client"
import { ROOT_ELEMENT_ID } from "../neutral/constants"
import { buildClientCapabilities, Showcase } from "./bootstrap"
import { devtoolsEnabled } from "./dev-tools/enabled"

/** The browser root is the session runtime's only owner; everything below borrows it. */
function SessionRoot(props: {
  readonly runtime: AuthStore
  readonly children: ReactNode
}): ReactElement {
  useSessionOwner(props.runtime)
  return <>{props.children}</>
}

function hydrate(): void {
  const root = document.getElementById(ROOT_ELEMENT_ID)
  if (root === null) {
    throw new Error(`Missing #${ROOT_ELEMENT_ID} root element.`)
  }

  // The server embedded the snapshot and the dehydrated cache as one JSON data block; the reader
  // parses and validates it at this trust boundary.
  const { snapshot, query } = readHydration(document)

  // The development inspector is reached only inside `import.meta.env.DEV` blocks, so the flag
  // folding to `false` tree-shakes it — and every devtools chunk and its CSS — out of the
  // production bundle (`check-production` proves it). The launcher touches no DOM, so it starts
  // before hydration: its HTTP interceptor must wrap the client at construction. The inspector
  // itself loads after hydration. A failure is reported and the app runs uninstrumented. A
  // browser profile can turn it off, as the flow suite does.
  let devtools: DevtoolsLauncher | undefined
  if (import.meta.env.DEV && devtoolsEnabled(() => window.localStorage)) {
    devtools = launchDevtools({
      report: console.error,
      http: { instance: "api", label: "Demo API" },
    })
  }

  // One query client — built once at startup for the browser (never a
  // module-level singleton), mirroring the per-request build on the server. The HTTP client reads
  // the app's own origin, so every `/api/*` read lands on the backend the SSR prefetch used.
  const queryClient = createQueryClient()
  const authRuntime = createAuthStore({
    baseUrl: `${window.location.origin}/auth`,
    initialSnapshot: sessionSnapshotOf(snapshotFor(snapshot, "auth")),
  })
  const devtoolsHttp = devtools?.http
  const httpClient = createHttpClient(
    devtoolsHttp
      ? {
          baseUrl: window.location.origin,
          protectedSession: authRuntime.protectedSession,
          interceptors: [devtoolsHttp.interceptor],
        }
      : { baseUrl: window.location.origin, protectedSession: authRuntime.protectedSession },
  )
  const capabilities = buildClientCapabilities({ queryClient, httpClient, authRuntime })

  hydrateRoot(
    root,
    <SessionRoot runtime={authRuntime}>
      <Showcase
        capabilities={capabilities}
        snapshot={snapshot}
        dehydratedState={query}
        initialPath={window.location.pathname}
      />
    </SessionRoot>,
  )

  if (import.meta.env.DEV && devtools !== undefined) {
    const origin = window.location.origin
    const teardown = devtools.mount({
      load: () =>
        import("./dev-tools/inspector").then(({ createShowcaseInspector }) =>
          createShowcaseInspector({ httpClient, origin }),
        ),
      query: { client: queryClient, instance: "app", label: "App cache" },
    })
    import.meta.hot?.dispose(teardown)
  }
}

hydrate()
