// The dev SSR host — a small Node/bun HTTP server that renders each request through the same
// `renderApp` seam the smoke tests drive, then hands hydration to Vite. Vite runs in middleware
// mode so the browser gets HMR and on-the-fly module transforms; `@plainworks/demo`' MSW server
// intercepts the *server-side* task fetch (the browser's own `/api/*` calls are served by the Vite
// mock plugin), so both render paths read one set of fixtures.
//
// Authentication runs through `@plainworks/auth`'s own `createServerSession` composition: the BFF
// routes `/login`, `/auth/callback`, and `/logout` drive begin/complete/logout, and the SSR render
// is session-gated. The identity provider is `@plainworks/testkit`'s in-process mock IdP — this is
// a dev harness, never bundled or published; run it with `bun run server.ts`.

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import type { ServerSessionJar } from "@plainworks/auth/server"
import { createMockServer } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { parseCookieHeader } from "@plainworks/std"
import { createMockIdp } from "@plainworks/testkit"
import { createServer as createViteServer } from "vite"
import { createShowcaseAuth } from "./src/app/auth"
import { AUTH_CALLBACK_PATH, LOGIN_PATH, LOGOUT_PATH } from "./src/app/constants"
import type { RenderApp } from "./src/entry-server"
import { respondWithInternalError } from "./src/server/internal-error"
import { PayloadTooLargeError, readRequestBody, resolveSigningKey } from "./src/server/request-body"

const PORT = Number(process.env.PORT ?? 5173)
const HOST = "127.0.0.1"
const CLIENT_ENTRY = "/src/client/entry-client.tsx"
const ORIGIN = `http://${HOST}:${PORT}`
// Any absolute origin works for the SSR data fetch: the MSW server intercepts it by path, so the
// host never has to be reachable.
const SSR_ORIGIN = "http://showcase.local"

const SIGNING_KEY = resolveSigningKey()

interface EntryServerModule {
  readonly renderApp: RenderApp
}

/** A cookie jar over a Node request/response — reads inbound cookies, buffers outbound `Set-Cookie`. */
function nodeJar(req: IncomingMessage): { jar: ServerSessionJar; cookies: string[] } {
  const inbound = parseCookieHeader(req.headers.cookie ?? "")
  const cookies: string[] = []
  return {
    jar: { get: (name) => inbound.get(name), set: (cookie) => cookies.push(cookie) },
    cookies,
  }
}

function redirect(res: ServerResponse, location: string, cookies: string[]): void {
  res.statusCode = 302
  res.setHeader("location", location)
  if (cookies.length > 0) {
    res.setHeader("set-cookie", cookies)
  }
  res.end()
}

async function main(): Promise<void> {
  const mock = createMockServer()
  mock.listen({ onUnhandledRequest: "error" })

  // The in-process identity provider. Its `fetch` seam backs the adapter's discovery/JWKS/token
  // calls; its `authorize` helper stands in for the interactive provider login page.
  const idp = await createMockIdp()
  const auth = createShowcaseAuth({
    fetch: idp.fetch,
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: `${ORIGIN}${AUTH_CALLBACK_PATH}`,
    signingKey: SIGNING_KEY,
  })

  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  })

  async function handleAuthRoute(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const { jar, cookies } = nodeJar(req)
    if (url.pathname === LOGIN_PATH) {
      const begin = await auth.session.beginLogin(jar, {
        returnTo: url.searchParams.get("returnTo") ?? "/",
      })
      // The mock IdP approves in-process, so we bounce straight to the callback rather than to a
      // real provider login page.
      const { callbackUrl } = idp.authorize(begin.authorizationUrl)
      redirect(res, callbackUrl, cookies)
      return
    }
    if (url.pathname === AUTH_CALLBACK_PATH) {
      const params = Object.fromEntries(url.searchParams)
      const result = await auth.session.completeLogin(jar, { params })
      redirect(res, result.returnTo, cookies)
      return
    }
    if (url.pathname === LOGOUT_PATH) {
      if (req.method !== "POST") {
        res.statusCode = 405
        res.setHeader("allow", "POST")
        res.end("Method Not Allowed")
        return
      }
      let body: string
      try {
        body = await readRequestBody(req)
      } catch (err) {
        if (err instanceof PayloadTooLargeError) {
          res.statusCode = 413
          res.end("Payload Too Large")
          return
        }
        throw err
      }
      const params = new URLSearchParams(body)
      const csrfToken = params.get("csrf") ?? req.headers["x-csrf-token"] ?? ""
      const valid = await auth.session.verifyCsrf(
        jar,
        typeof csrfToken === "string" ? csrfToken : "",
      )
      if (!valid) {
        res.statusCode = 403
        res.end("Forbidden")
        return
      }
      await auth.session.logout(jar)
      redirect(res, "/", cookies)
      return
    }
    res.statusCode = 404
    res.end("Not Found")
  }

  const server = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", ORIGIN)
    const isAuthRoute =
      url.pathname === LOGIN_PATH ||
      url.pathname === AUTH_CALLBACK_PATH ||
      url.pathname === LOGOUT_PATH
    if (isAuthRoute) {
      handleAuthRoute(req, res, url).catch(() => {
        process.stderr.write("showcase authentication request failed\n")
        respondWithInternalError(res)
      })
      return
    }
    vite.middlewares(req, res, async () => {
      try {
        const rawPath = req.url ?? "/"
        const url = new URL(rawPath, ORIGIN)
        const requestPath = `${url.pathname}${url.search}`
        const { renderApp } = (await vite.ssrLoadModule(
          "/src/entry-server.tsx",
        )) as EntryServerModule
        const httpClient = createHttpClient({ baseUrl: SSR_ORIGIN })
        const { html, status, location } = await renderApp({
          path: requestPath,
          cookieHeader: req.headers.cookie ?? "",
          httpClient,
          clientEntry: CLIENT_ENTRY,
          readSession: auth.read,
        })
        if (location !== undefined) {
          redirect(res, location, [])
          return
        }
        const document = await vite.transformIndexHtml(rawPath, html)
        res.statusCode = status
        res.setHeader("content-type", "text/html")
        res.end(document)
      } catch (error) {
        vite.ssrFixStacktrace(error instanceof Error ? error : new Error(String(error)))
        process.stderr.write("showcase render request failed\n")
        respondWithInternalError(res)
      }
    })
  })

  server.listen(PORT, HOST, () => {
    process.stdout.write(`showcase dev server on http://${HOST}:${PORT}\n`)
  })
}

void main()
