// The dev SSR host — a small Node/bun HTTP server that renders each request through the same
// `renderApp` seam the smoke tests drive, then hands hydration to Vite. Vite runs in middleware
// mode so the browser gets HMR and on-the-fly module transforms; `@plainworks/demo`' MSW server
// intercepts server-side data reads, while an independently constructed graph serves browser
// `/api/*` calls through the Vite mock plugin. Both use the same seeded demo factory and wire
// contract without sharing data; only the browser plane's error switch is mirrored into the SSR
// one.
//
// Authentication runs through `@plainworks/auth`'s own `createServerSession` composition: the BFF
// routes `/login`, `/auth/callback`, and `/logout` drive begin/complete/logout, and the SSR render
// is session-gated. The identity provider is `@plainworks/testkit`'s in-process mock IdP — this is
// a dev harness, never bundled or published; run it with `bun run server.ts`.

import { readFile } from "node:fs/promises"
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { isAuthErrorKind, sanitizeReturnTo } from "@plainworks/auth"
import type { ServerSessionJar } from "@plainworks/auth/server"
import { createMockApi } from "@plainworks/demo"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { mockServerPlugin } from "@plainworks/mocks/vite-plugin"
import { parseCookieHeader, systemClock } from "@plainworks/std"
import { createMockIdp, manualClock } from "@plainworks/testkit"
import { createServer as createViteServer, type ViteDevServer } from "vite"
import { createShowcaseAuth } from "./src/app/auth"
import { AUTH_CALLBACK_PATH, LOGIN_PATH, LOGOUT_PATH } from "./src/app/constants"
import { createNotificationMutationAuthorizer } from "./src/app/notification-authz"
import { createOrderMutationAuthorizer } from "./src/app/order-authz"
import {
  createSettingsMutationAuthorizer,
  createSettingsReadAuthorizer,
} from "./src/app/settings-authz"
import type { RenderApp } from "./src/entry-server"
import { respondWithInternalError } from "./src/server/internal-error"
import { renderLoginPage } from "./src/server/login-page"
import { PayloadTooLargeError, readRequestBody, resolveSigningKey } from "./src/server/request-body"

const PORT = Number(process.env.PORT ?? 5173)
const HOST = "127.0.0.1"
const CLIENT_ENTRY = "/src/client/entry-client.tsx"
const STYLESHEET_ENTRY = "/src/client/styles.css"
// `/login?reason=interrupted` explains that the previous sign-in could not finish.
const LOGIN_REASON_PARAM = "reason"
const LOGIN_INTERRUPTED = "interrupted"
const ORIGIN = `http://${HOST}:${PORT}`
// Any absolute origin works for the SSR data fetch: the MSW server intercepts it by path, so the
// host never has to be reachable.
const SSR_ORIGIN = "http://showcase.local"

const SIGNING_KEY = resolveSigningKey()

// The browser gate pins the demo backend's clock to the same instant it pins the browser's, so
// every fixture date is identical on each run and on each machine.
const FIXED_NOW = process.env.PLAINWORKS_FIXED_NOW
const DEMO_CLOCK = FIXED_NOW === undefined ? systemClock : manualClock(FIXED_NOW)

// Browser-test fixture pages, `/e2e/fixtures/<name>.html`. They go through Vite's HTML transform
// like app pages, so they load modules and connect the reload client from this same origin.
const FIXTURE_PAGE = /^\/e2e\/fixtures\/([a-z0-9-]+)\.html$/
const FIXTURE_PAGES_DIR = new URL("./e2e/fixtures/", import.meta.url)

interface EntryServerModule {
  readonly renderApp: RenderApp
}

/**
 * A cookie jar over a Node request/response — reads inbound cookies, buffers outbound
 * `Set-Cookie`.
 */
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

function sendHtml(res: ServerResponse, html: string, headOnly = false): void {
  res.statusCode = 200
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.end(headOnly ? undefined : html)
}

function methodNotAllowed(res: ServerResponse, allowed: string): void {
  res.statusCode = 405
  res.setHeader("allow", allowed)
  res.end("Method Not Allowed")
}

async function main(): Promise<void> {
  const ssrMock = createMockServerHandle({ clock: DEMO_CLOCK })
  ssrMock.server.listen({ onUnhandledRequest: "error" })

  // The in-process identity provider. Its `fetch` seam backs the adapter's discovery/JWKS/token
  // calls; its `authorize` helper stands in for the interactive provider login page.
  const idp = await createMockIdp({ claims: { name: "Ada" } })
  const auth = createShowcaseAuth({
    fetch: idp.fetch,
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: `${ORIGIN}${AUTH_CALLBACK_PATH}`,
    signingKey: SIGNING_KEY,
  })
  const browserMock = createMockApi({
    clock: DEMO_CLOCK,
    authorizeOrderMutation: createOrderMutationAuthorizer(auth.read),
    authorizeNotificationMutation: createNotificationMutationAuthorizer(auth.read),
    authorizeSettingsRead: createSettingsReadAuthorizer(auth.read),
    authorizeSettingsMutation: createSettingsMutationAuthorizer(auth.read),
  })

  let vite: ViteDevServer

  async function handleAuthRoute(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const { jar, cookies } = nodeJar(req)
    if (url.pathname === LOGIN_PATH) {
      // A signed-out landing page, not an automatic redirect: the mock IdP approves in-process, so
      // auto-starting the flow here would let the session gate re-authenticate the instant a user
      // logs out. `GET` shows the page; only an explicit `POST` (the "Sign in" button) begins
      // login.
      if (req.method === "GET" || req.method === "HEAD") {
        const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo") ?? "/")
        sendHtml(
          res,
          renderLoginPage({
            returnTo,
            interrupted: url.searchParams.get(LOGIN_REASON_PARAM) === LOGIN_INTERRUPTED,
            cookieHeader: req.headers.cookie ?? "",
            stylesheets: [STYLESHEET_ENTRY],
          }),
          req.method === "HEAD",
        )
        return
      }
      if (req.method !== "POST") {
        methodNotAllowed(res, "GET, HEAD, POST")
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
      const returnTo = new URLSearchParams(body).get("returnTo") ?? "/"
      const begin = await auth.session.beginLogin(jar, { returnTo })
      // The mock IdP approves in-process, so we bounce straight to the callback rather than to a
      // real provider login page.
      const { callbackUrl } = idp.authorize(begin.authorizationUrl)
      redirect(res, callbackUrl, cookies)
      return
    }
    if (url.pathname === AUTH_CALLBACK_PATH) {
      if (req.method !== "GET") {
        methodNotAllowed(res, "GET")
        return
      }
      const params = Object.fromEntries(url.searchParams)
      let returnTo: string
      try {
        returnTo = (await auth.session.completeLogin(jar, { params })).returnTo
      } catch (err) {
        // No valid login transaction: the cookie expired or sign-in began on another origin. Back
        // to the login page with a notice; restarting sign-in here would loop if the browser keeps
        // dropping the cookie.
        if (!isAuthErrorKind(err, "auth/login-transaction")) throw err
        returnTo = `${LOGIN_PATH}?${LOGIN_REASON_PARAM}=${LOGIN_INTERRUPTED}`
      }
      redirect(res, returnTo, cookies)
      return
    }
    if (url.pathname === LOGOUT_PATH) {
      if (req.method !== "POST") {
        methodNotAllowed(res, "POST")
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

  async function serveFixturePage(name: string, url: URL, res: ServerResponse): Promise<void> {
    let source: string
    try {
      source = await readFile(new URL(`${name}.html`, FIXTURE_PAGES_DIR), "utf8")
    } catch {
      res.statusCode = 404
      res.end("Not Found")
      return
    }
    const document = await vite.transformIndexHtml(`${url.pathname}${url.search}`, source)
    res.setHeader("content-type", "text/html")
    res.end(document)
  }

  const server = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", ORIGIN)
    const fixturePage = req.method === "GET" ? FIXTURE_PAGE.exec(url.pathname) : null
    if (fixturePage?.[1] !== undefined) {
      serveFixturePage(fixturePage[1], url, res).catch(() => {
        process.stderr.write("showcase fixture page request failed\n")
        respondWithInternalError(res)
      })
      return
    }
    if (url.pathname === "/mock/reset" && req.method === "POST") {
      ssrMock.api.reset()
      browserMock.reset()
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ success: true }))
      return
    }
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
        // The demo's error switch lives on the browser plane (`/mock/error`). The SSR plane follows
        // it, so a server-prefetched section fails the same way. Latency stays browser-only, so a
        // slowed section still paints its loading state instead of stalling the server render.
        ssrMock.api.control.setError(browserMock.control.isErrorEnabled())
        const httpClient = createHttpClient({ baseUrl: SSR_ORIGIN })
        const { html, status, location } = await renderApp({
          path: requestPath,
          cookieHeader: req.headers.cookie ?? "",
          httpClient,
          stylesheets: [STYLESHEET_ENTRY],
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

  // Run Vite's HMR socket over this same HTTP server instead of its own standalone port. In
  // middleware mode Vite otherwise opens a separate WebSocket server that this harness never
  // closes, so a `^C` orphans it and the next start fails with `EADDRINUSE` on the HMR port.
  // The mock backend that serves the browser's `/api/*` calls is wired here (not in `vite.config`)
  // so its order-write authorizer verifies cookies under the *same* `SIGNING_KEY` the session flow
  // signs with — a config-time authorizer would resolve its own key and reject every real session.
  // A custom app has no `index.html` for Vite to crawl, so it would find dependencies one page at a
  // time and re-bundle them mid-session. A page loaded across that re-bundle mixes two copies of
  // React. Naming every browser entry, including the E2E fixtures, pre-bundles them all at start.
  // `warmup` transforms both graphs at start, so the first page load does not pay for them. The
  // browser gate runs one server per worker and gives each its own dependency cache. The watcher
  // skips test output: a flow writes DOM snapshots mid-run, and watching them would reload the page
  // under test.
  vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server },
      watch: { ignored: ["**/.ui-artifacts/**", "**/test-results/**", "**/playwright-report/**"] },
      warmup: {
        clientFiles: [CLIENT_ENTRY.slice(1), "e2e/fixtures/**/*.tsx"],
        ssrFiles: ["src/entry-server.tsx"],
      },
    },
    appType: "custom",
    ...(process.env.SHOWCASE_VITE_CACHE_DIR === undefined
      ? {}
      : { cacheDir: process.env.SHOWCASE_VITE_CACHE_DIR }),
    optimizeDeps: { entries: [CLIENT_ENTRY.slice(1), "e2e/fixtures/**/*.tsx"] },
    plugins: [
      mockServerPlugin(browserMock.handlers, { basePath: "/api" }),
      mockServerPlugin(browserMock.handlers, { basePath: "/mock" }),
    ],
  })

  // Close Vite (and its HMR socket) with the process so nothing is left bound after shutdown.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void vite.close().finally(() => {
        server.close(() => process.exit(0))
      })
    })
  }

  server.listen(PORT, HOST, () => {
    process.stdout.write(`showcase dev server on http://${HOST}:${PORT}\n`)
  })
}

void main()
