// The SSR render — the neutral composition seam the dev server and the smoke tests both drive. It
// resolves the per-request snapshot through the composition kernel, prefetches the task list into a
// request-scoped query client, renders the one shared `<Showcase>` tree to a string, and wraps it
// in the document shell with the snapshot, the dehydrated cache, and the persisted theme class
// inlined. It builds every store/client/source per call — no module-level singleton — so two
// concurrent requests never share state. The network is an injected seam: the caller sets up the
// mock (MSW in a test, the mock server in dev) and hands in the request-scoped `httpClient`.

import { createApp, serializeSnapshot, snapshotFor } from "@plainworks/app"
import { authSnapshotOf, unauthenticatedRedirect } from "@plainworks/auth"
import type { HttpClient } from "@plainworks/http"
import { createQueryClient, dehydrateClient, prefetchQuery } from "@plainworks/query"
import type { WebAbortSignal } from "@plainworks/std"
import { renderToString } from "react-dom/server"
import type { ReadShowcaseSession } from "../app/auth"
import { authServerCapability } from "../app/auth"
import {
  AUTH_CAPABILITY_ID,
  LOGIN_PATH,
  TASK_LIST_PARAMS,
  THEME_CAPABILITY_ID,
} from "../app/constants"
import { themeServerCapability } from "../app/create-showcase-app"
import { taskListPlan } from "../app/task-read"
import { resolveHtmlClass } from "../app/theme"
import { buildClientCapabilities } from "../client/capabilities"
import { createDemoTransport } from "../client/live-stream"
import { Showcase } from "../client/showcase"
import { createLiveTasksSource, createThemeSource } from "../client/sources"
import { renderHtmlShell } from "./html-shell"

/** Everything one SSR request needs. */
export interface RenderInput {
  /** The requested path, seeded into the router so the first client render matches the markup. */
  readonly path: string
  /** The incoming `Cookie` header — the theme resolver reads the preference from it. */
  readonly cookieHeader: string
  /** The request-scoped typed fetch client the task prefetch reads through (mock-backed in dev/test). */
  readonly httpClient: HttpClient
  /** The client entry module URL the browser boots hydration from. */
  readonly clientEntry: string
  /**
   * Resolve the session from the request cookie — the package's `createServerSession.read`,
   * injected so the render graph never imports the dev/test IdP. An unauthenticated request to the
   * dashboard is redirected to the login route.
   */
  readonly readSession: ReadShowcaseSession
  /** Abort the resolve/prefetch when the request is torn down. */
  readonly signal?: WebAbortSignal
}

/** A rendered SSR response. */
export interface RenderResult {
  /** The full HTML document, or an empty string on a redirect. */
  readonly html: string
  /** The HTTP status to send. */
  readonly status: number
  /** When set, the `Location` to redirect to instead of rendering (session gate). */
  readonly location?: string
}

/** Render one request to an HTML document with a hydratable snapshot and cache. */
export async function renderApp(input: RenderInput): Promise<RenderResult> {
  const app = createApp({
    capabilities: [themeServerCapability(), authServerCapability(input.readSession)],
  })
  const headers = new Headers({ cookie: input.cookieHeader })
  const snapshot = await app.resolve(input.signal ? { headers, signal: input.signal } : { headers })

  // Session gate: the dashboard is protected, so an unauthenticated request is bounced to the login
  // route with a sanitized return target rather than rendered.
  const auth = authSnapshotOf(snapshotFor(snapshot, AUTH_CAPABILITY_ID))
  if (!auth.authenticated) {
    return {
      html: "",
      status: 302,
      location: unauthenticatedRedirect({ loginPath: LOGIN_PATH }, input.path).to,
    }
  }

  const queryClient = createQueryClient()
  await prefetchQuery(queryClient, taskListPlan(input.httpClient, TASK_LIST_PARAMS))
  const dehydratedState = dehydrateClient(queryClient, { shouldDehydrateQuery: () => true })

  const themeSource = createThemeSource()
  const liveSource = createLiveTasksSource()
  const capabilities = buildClientCapabilities({ queryClient, themeSource })

  const pathname = new URL(input.path, "http://localhost").pathname
  const appHtml = renderToString(
    <Showcase
      capabilities={capabilities}
      snapshot={snapshot}
      dehydratedState={dehydratedState}
      httpClient={input.httpClient}
      liveSource={liveSource}
      initialPath={pathname}
      transport={createDemoTransport()}
    />,
  )

  const html = renderHtmlShell({
    htmlClass: resolveHtmlClass(snapshotFor(snapshot, THEME_CAPABILITY_ID)),
    appHtml,
    snapshotJson: serializeSnapshot(snapshot),
    queryJson: JSON.stringify(dehydratedState),
    clientEntry: input.clientEntry,
  })

  return { html, status: 200 }
}
