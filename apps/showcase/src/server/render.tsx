// The SSR render — the neutral composition seam the dev server and the smoke tests both drive.
// It resolves the per-request snapshot through the composition kernel, prefetches the active
// section's queries into a request-scoped query client, renders the one shared `<Showcase>` tree to
// a complete stream, and wraps it in the document shell with the persisted theme class and the
// hydration payload (snapshot plus dehydrated cache) written by `@plainworks/app/hydration`.
// It builds every store/client/source per call — no module-level singleton — so two concurrent
// requests never share state. The network is an injected seam: the caller sets up the mock (MSW in
// a test, the mock server in dev) and hands in the request-scoped `httpClient`.

import { Writable } from "node:stream"
import { createApp, snapshotFor } from "@plainworks/app"
import { AUTH_CAPABILITY_ID, createAuthResolver } from "@plainworks/app/capabilities/auth"
import { createThemeResolver } from "@plainworks/app/capabilities/theme"
import { renderHydrationScript } from "@plainworks/app/hydration"
import { unauthenticatedRedirect } from "@plainworks/auth/redirect"
import { authSnapshotOf } from "@plainworks/auth/session"
import type { HttpClient } from "@plainworks/http"
import { createQueryClient } from "@plainworks/query"
import { dehydrateClient } from "@plainworks/query/hydration"
import type { WebAbortSignal } from "@plainworks/std/web"
import type { ReactNode } from "react"
import { renderToPipeableStream } from "react-dom/server.node"
import type { ReadShowcaseSession } from "../app/auth"
import { LOGIN_PATH, THEME_COOKIE } from "../app/constants"
import { sectionForPath } from "../app/navigation"
import { prefetchSection } from "../app/section-prefetch"
import { buildClientCapabilities } from "../client/capabilities"
import { Showcase } from "../client/showcase"
import { renderHtmlShell } from "./html-shell"

/** Everything one SSR request needs. */
export interface RenderInput {
  /** The requested path, seeded into the router so the first client render matches the markup. */
  readonly path: string
  /** The incoming `Cookie` header — the theme resolver reads the preference from it. */
  readonly cookieHeader: string
  /**
   * The request-scoped typed fetch client the active section's prefetch reads through — the
   * overview summaries, or the tasks/orders/products/users list for its route (mock-backed in
   * dev/test).
   */
  readonly httpClient: HttpClient
  /** Stylesheet URLs the host resolved for the initial document. */
  readonly stylesheets: readonly string[]
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

function renderAppHtml(node: ReactNode): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = ""
    const decoder = new TextDecoder()
    const output = new Writable({
      write(chunk: Uint8Array, _encoding, callback) {
        html += decoder.decode(chunk, { stream: true })
        callback()
      },
    })
    output.once("finish", () => resolve(html + decoder.decode()))
    output.once("error", reject)

    const stream = renderToPipeableStream(node, {
      onAllReady: () => stream.pipe(output),
      onShellError: reject,
      onError: reject,
    })
  })
}

/** Render one request to an HTML document with a hydratable snapshot and cache. */
export async function renderApp(input: RenderInput): Promise<RenderResult> {
  const app = createApp({
    capabilities: [
      createThemeResolver({ cookie: THEME_COOKIE }),
      createAuthResolver({ read: input.readSession }),
    ],
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
  const pathname = new URL(input.path, "http://localhost").pathname
  await prefetchSection(sectionForPath(pathname).id, queryClient, input.httpClient)
  const dehydratedState = dehydrateClient(queryClient, { shouldDehydrateQuery: () => true })

  const capabilities = buildClientCapabilities({ queryClient, httpClient: input.httpClient })

  const appHtml = await renderAppHtml(
    <Showcase
      capabilities={capabilities}
      snapshot={snapshot}
      dehydratedState={dehydratedState}
      initialPath={pathname}
    />,
  )

  const html = renderHtmlShell({
    htmlClass: app.htmlClass(snapshot),
    appHtml,
    hydrationScript: renderHydrationScript({ snapshot, query: dehydratedState }),
    stylesheets: input.stylesheets,
    clientEntry: input.clientEntry,
  })

  return { html, status: 200 }
}
