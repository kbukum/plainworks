// The dev SSR host — a small Node/bun HTTP server that renders each request through the same
// `renderApp` seam the smoke tests drive, then hands hydration to the client. By default Vite runs
// in middleware mode, so the browser gets HMR and on-the-fly module transforms. With
// `SHOWCASE_BUILD_DIR` set, the host serves the browser gate's prebuilt bundle instead
// (`vite.gate.config.ts`): a few files per page rather than hundreds of transformed modules.
//
// Each data scope (`@plainworks/mocks/scope`, named by a request header the browser gate sets per
// test) gets two seeded `@plainworks/demo` backends: one serves the browser's `/api/*` and
// `/mock/*` calls, and the other serves server-side data reads through the SSR client's `fetch`.
// Both use the same seeded demo factory and wire contract without sharing data; only the browser
// plane's error switch is mirrored into the SSR one. Requests without the header share one default
// scope, so plain development works as before.
//
// Authentication runs through `@plainworks/auth`'s own `createServerSession` composition: the BFF
// routes `/login`, `/auth/callback`, and `/auth/logout` drive begin/complete/logout, and the SSR
// render is session-gated. The identity provider is `@plainworks/mocks/idp`'s in-process mock
// IdP — this is a dev harness, never bundled or published; run it with `bun run server.ts`.

import { readFile } from "node:fs/promises"
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pathToFileURL } from "node:url"
import { AuthError, isAuthErrorKind } from "@plainworks/auth"
import { sanitizeReturnTo } from "@plainworks/auth/redirect"
import {
  authFailureResponse,
  createMemorySessionStore,
  createRequestJar,
  isSameOriginRequest,
  readFormBody,
  redirectToPath,
  redirectToUrl,
} from "@plainworks/auth/server"
import { createMockApi, type MockApi } from "@plainworks/demo"
import { createHttpClient } from "@plainworks/http"
import { dispatchMockRequest } from "@plainworks/mocks/dispatch"
import { createMockIdp } from "@plainworks/mocks/idp"
import {
  createMockScopes,
  MockScopeError,
  type MockScopeHeaders,
  scopedMockHandlers,
} from "@plainworks/mocks/scope"
import { fixedClock, systemClock } from "@plainworks/std/time"
import { PayloadTooLargeError, type WebFetch } from "@plainworks/std/web"
import type { RequestHandler } from "msw"
import { createServer as createViteServer, type ViteDevServer } from "vite"
import type { RenderApp } from "./src/entry-server"
import { createShowcaseAuth } from "./src/neutral/auth"
import { showcaseSessionSchema } from "./src/neutral/auth/session"
import { AUTH_CALLBACK_PATH, LOGIN_PATH, LOGOUT_PATH } from "./src/neutral/constants"
import { createNotificationMutationAuthorizer } from "./src/neutral/notifications"
import { createOrderMutationAuthorizer } from "./src/neutral/orders"
import {
  createSettingsMutationAuthorizer,
  createSettingsReadAuthorizer,
} from "./src/neutral/settings"
import { respondWithInternalError } from "./src/server/internal-error"
import { renderLoginPage } from "./src/server/login-page"
import { sendWebResponse, toWebRequest } from "./src/server/web-bridge"

const PORT = Number(process.env.PORT ?? 5173)
// The browser gate's prebuilt bundle (`vite.gate.config.ts`); unset runs Vite's dev server.
const BUILD_DIR = process.env.SHOWCASE_BUILD_DIR
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

// Sessions live in this process's memory, so the transaction/CSRF signing key does too: a fresh
// random key per process, never configured. The Next host shows durable custody.
const SIGNING_KEY = crypto.getRandomValues(new Uint8Array(32))

// The browser gate pins the demo backend's clock to the same instant it pins the browser's, so
// every fixture date is identical on each run and on each machine.
const FIXED_NOW = process.env.PLAINWORKS_FIXED_NOW
const DEMO_CLOCK = FIXED_NOW === undefined ? systemClock : fixedClock(FIXED_NOW)

// Browser-test fixture pages, `/e2e/fixtures/<name>.html`. They go through Vite's HTML transform
// like app pages, so they load modules and connect the reload client from this same origin.
const FIXTURE_PAGE = /^\/e2e\/fixtures\/([a-z0-9-]+)\.html$/
const FIXTURE_PAGES_DIR = new URL("./e2e/fixtures/", import.meta.url)
// A built asset: one flat, hashed file name, so no request path can leave the assets directory.
const BUILT_ASSET = /^\/assets\/([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(js|css|svg|png|woff2))$/
const ASSET_TYPES: Readonly<Record<string, string>> = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  woff2: "font/woff2",
}

interface EntryServerModule {
  readonly renderApp: RenderApp
}

/** Where the page's script and styles come from: Vite's dev server, or the prebuilt bundle. */
interface ClientAssets {
  readonly clientEntry: string
  readonly stylesheets: readonly string[]
}

/** One test's data: the browser's demo backend and the server render's own. */
interface DemoScope {
  readonly browser: MockApi
  readonly ssr: MockApi
}

interface ViteManifestChunk {
  readonly file: string
}

async function readBuiltAssets(buildDir: string): Promise<ClientAssets> {
  const manifest = JSON.parse(
    await readFile(join(buildDir, "client/.vite/manifest.json"), "utf8"),
  ) as Readonly<Record<string, ViteManifestChunk | undefined>>
  const entry = manifest["src/client/entry-client.tsx"]?.file
  const styles = manifest["src/client/styles.css"]?.file
  if (entry === undefined || styles === undefined) {
    throw new Error(`The gate build in ${buildDir} has no client entry or stylesheet.`)
  }
  return { clientEntry: `/${entry}`, stylesheets: [`/${styles}`] }
}

/** Read a Node request's headers the way `@plainworks/mocks/scope` reads a `Headers`. */
function nodeHeaders(req: IncomingMessage): MockScopeHeaders {
  return {
    get: (name) => {
      const value = req.headers[name.toLowerCase()]
      return value === undefined ? null : Array.isArray(value) ? value.join(", ") : value
    },
  }
}

/** A `fetch` that answers from `handlers` in this process, for the SSR client's data reads. */
function dispatchingFetch(handlers: readonly RequestHandler[]): WebFetch {
  return async (input, init) => {
    // The HTTP client hands over platform values; the kit's Web types only describe them
    // structurally, as `@plainworks/std/web`'s own platform `fetch` does.
    const request = new Request(String(input), init as RequestInit | undefined)
    return (
      (await dispatchMockRequest(request, handlers)) ??
      Response.json(
        { error: `No mock handler for ${request.method} ${request.url}` },
        { status: 404 },
      )
    )
  }
}

/**
 * Adapt a Node request to a Fetch `Request` for MSW. The body streams through unread, and the
 * signal aborts when the client disconnects before the response ends.
 */
function toFetchRequest(req: IncomingMessage, res: ServerResponse): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      headers.append(name, item)
    }
  }
  const disconnect = new AbortController()
  res.once("close", () => {
    if (!res.writableEnded) disconnect.abort()
  })
  const method = req.method ?? "GET"
  const hasBody = method !== "GET" && method !== "HEAD"
  return new Request(new URL(req.url ?? "/", ORIGIN), {
    method,
    headers,
    signal: disconnect.signal,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream<Uint8Array>, duplex: "half" } : {}),
  })
}

function isMockPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/mock" ||
    pathname.startsWith("/mock/")
  )
}

/** Redirect to a path on this origin; the kit sanitizes it and attaches any minted cookies. */
function redirect(
  res: ServerResponse,
  path: string,
  cookies: readonly string[] = [],
): Promise<void> {
  return sendWebResponse(res, redirectToPath({ origin: ORIGIN, path, cookies }))
}

// A rejected CSRF proof answers with the session problem the client's session decoder reads.
const csrfRejected = () => authFailureResponse(new AuthError("auth/csrf", "CSRF proof rejected"))

function sendStatus(res: ServerResponse, status: number, message: string): void {
  res.statusCode = status
  res.end(message)
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
  // The in-process identity provider. Its `fetch` seam backs the adapter's discovery/JWKS/token
  // calls; its `authorize` helper stands in for the interactive provider login page.
  const idp = await createMockIdp({ claims: { name: "Ada" } })
  const auth = createShowcaseAuth({
    store: createMemorySessionStore({ schema: showcaseSessionSchema }),
    fetch: idp.fetch,
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: `${ORIGIN}${AUTH_CALLBACK_PATH}`,
    signingKey: SIGNING_KEY,
  })
  // The browser backends' authorizers read the *same* in-memory session store the session flow
  // writes, so a real session passes them.
  const authorizers = {
    authorizeOrderMutation: createOrderMutationAuthorizer(auth.read),
    authorizeNotificationMutation: createNotificationMutationAuthorizer(auth.read),
    authorizeSettingsRead: createSettingsReadAuthorizer(auth.read),
    authorizeSettingsMutation: createSettingsMutationAuthorizer(auth.read),
  }
  const scopes = createMockScopes<DemoScope>({
    create: () => ({
      browser: createMockApi({ clock: DEMO_CLOCK, ...authorizers }),
      ssr: createMockApi({ clock: DEMO_CLOCK }),
    }),
  })
  const browserHandlers = scopedMockHandlers(scopes, (scope) => scope.browser.handlers)

  // Exactly one of these is set: Vite's dev server, or the prebuilt bundle's render and assets.
  let vite: ViteDevServer | undefined
  let built: { readonly renderApp: RenderApp; readonly assets: ClientAssets } | undefined
  if (BUILD_DIR !== undefined) {
    const entry = (await import(
      pathToFileURL(join(BUILD_DIR, "server/entry-server.js")).href
    )) as EntryServerModule
    built = { renderApp: entry.renderApp, assets: await readBuiltAssets(BUILD_DIR) }
  }
  const stylesheets = built?.assets.stylesheets ?? [STYLESHEET_ENTRY]

  async function handleAuthRoute(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    const request = toWebRequest(req, res, ORIGIN)
    const { jar, cookies } = createRequestJar(request)

    // Read a same-origin form POST under the kit's body cap. Answers 403 for a cross-site request
    // and 413 for an oversized body, then returns `undefined` so the route stops.
    const readSameOriginForm = async (): Promise<URLSearchParams | undefined> => {
      if (!isSameOriginRequest(request, ORIGIN)) {
        sendStatus(res, 403, "Forbidden")
        return undefined
      }
      try {
        return await readFormBody(request)
      } catch (err) {
        if (err instanceof PayloadTooLargeError) {
          sendStatus(res, 413, "Payload Too Large")
          return undefined
        }
        throw err
      }
    }

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
            revocationUnconfirmed:
              url.searchParams.get(LOGIN_REASON_PARAM) === "revocation-unconfirmed",
            cookieHeader: req.headers.cookie ?? "",
            stylesheets,
          }),
          req.method === "HEAD",
        )
        return
      }
      if (req.method !== "POST") {
        methodNotAllowed(res, "GET, HEAD, POST")
        return
      }
      const form = await readSameOriginForm()
      if (form === undefined) return
      const begin = await auth.session.beginLogin(jar, { returnTo: form.get("returnTo") ?? "/" })
      // The mock IdP approves in-process, so we bounce straight to the callback rather than to a
      // real provider login page.
      const { callbackUrl } = idp.authorize(begin.authorizationUrl)
      await sendWebResponse(res, redirectToUrl(callbackUrl, cookies))
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
      await redirect(res, returnTo, cookies)
      return
    }
    if (url.pathname === LOGOUT_PATH) {
      if (req.method !== "POST") {
        methodNotAllowed(res, "POST")
        return
      }
      if (
        !isSameOriginRequest(request, ORIGIN) ||
        !(await auth.session.verifyLogoutCsrf(jar, request.headers.get("x-csrf-token") ?? ""))
      ) {
        await sendWebResponse(res, csrfRejected())
        return
      }
      await auth.session.logout(jar)
      res.setHeader("set-cookie", [...cookies])
      res.statusCode = 204
      res.end()
      return
    }
    if (url.pathname === "/auth/session") {
      if (req.method !== "GET") {
        methodNotAllowed(res, "GET")
        return
      }
      try {
        const status = await auth.session.status(jar)
        res.setHeader("cache-control", "no-store")
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify(status))
      } catch (cause) {
        await sendWebResponse(res, authFailureResponse(cause))
      }
      return
    }
    sendStatus(res, 404, "Not Found")
  }

  async function serveFixturePage(name: string, url: URL, res: ServerResponse): Promise<void> {
    let source: string
    try {
      source = await readFile(
        BUILD_DIR === undefined
          ? new URL(`${name}.html`, FIXTURE_PAGES_DIR)
          : join(BUILD_DIR, "client/e2e/fixtures", `${name}.html`),
        "utf8",
      )
    } catch {
      sendStatus(res, 404, "Not Found")
      return
    }
    const document =
      vite === undefined
        ? source
        : await vite.transformIndexHtml(`${url.pathname}${url.search}`, source)
    res.setHeader("content-type", "text/html")
    res.end(document)
  }

  async function serveBuiltAsset(
    buildDir: string,
    name: string,
    type: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    let body: Buffer
    try {
      body = await readFile(join(buildDir, "client/assets", name))
    } catch {
      sendStatus(res, 404, "Not Found")
      return
    }
    res.statusCode = 200
    res.setHeader("content-type", type)
    res.setHeader("cache-control", "public, max-age=31536000, immutable")
    res.end(req.method === "HEAD" ? undefined : body)
  }

  // The demo backend for `/api/*` and `/mock/*`, in the request's own data scope. A request no
  // handler matches ends here with 404: its body is already read.
  async function serveMock(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const request = toFetchRequest(req, res)
    const response =
      (await dispatchMockRequest(request, browserHandlers)) ??
      Response.json({ error: `No mock handler for ${request.method} ${req.url}` }, { status: 404 })
    if (request.signal.aborted) return
    await sendWebResponse(res, response)
  }

  async function loadRenderApp(): Promise<RenderApp> {
    if (built !== undefined) return built.renderApp
    if (vite === undefined) throw new Error("The showcase host has neither a build nor Vite.")
    return ((await vite.ssrLoadModule("/src/entry-server.tsx")) as EntryServerModule).renderApp
  }

  async function render(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawPath = req.url ?? "/"
    const url = new URL(rawPath, ORIGIN)
    const requestPath = `${url.pathname}${url.search}`
    const scope = scopes.resolve(nodeHeaders(req))
    const renderApp = await loadRenderApp()
    // The demo's error switch lives on the browser plane (`/mock/error`). The SSR plane follows it,
    // so a server-prefetched section fails the same way. Latency stays browser-only, so a slowed
    // section still paints its loading state instead of stalling the server render.
    scope.ssr.control.setError(scope.browser.control.isErrorEnabled())
    // Any absolute origin works: the client's `fetch` answers from this scope's SSR backend.
    const httpClient = createHttpClient({
      baseUrl: SSR_ORIGIN,
      fetch: dispatchingFetch(scope.ssr.handlers),
    })
    const { html, status, location } = await renderApp({
      path: requestPath,
      cookieHeader: req.headers.cookie ?? "",
      httpClient,
      stylesheets,
      clientEntry: built?.assets.clientEntry ?? CLIENT_ENTRY,
      readSession: auth.read,
    })
    if (location !== undefined) {
      await redirect(res, location)
      return
    }
    const document = vite === undefined ? html : await vite.transformIndexHtml(rawPath, html)
    res.statusCode = status
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
      let scope: DemoScope
      try {
        scope = scopes.resolve(nodeHeaders(req))
      } catch (error) {
        if (!(error instanceof MockScopeError)) throw error
        sendStatus(res, 400, error.message)
        return
      }
      scope.ssr.reset()
      scope.browser.reset()
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify({ success: true }))
      return
    }
    const asset =
      BUILD_DIR !== undefined && (req.method === "GET" || req.method === "HEAD")
        ? BUILT_ASSET.exec(url.pathname)
        : null
    if (BUILD_DIR !== undefined && asset?.[1] !== undefined && asset[2] !== undefined) {
      serveBuiltAsset(
        BUILD_DIR,
        asset[1],
        ASSET_TYPES[asset[2]] ?? "application/octet-stream",
        req,
        res,
      ).catch(() => respondWithInternalError(res))
      return
    }
    const isAuthRoute =
      url.pathname === LOGIN_PATH ||
      url.pathname === AUTH_CALLBACK_PATH ||
      url.pathname === "/auth/session" ||
      url.pathname === LOGOUT_PATH
    if (isAuthRoute) {
      handleAuthRoute(req, res, url).catch((cause: unknown) => {
        process.stderr.write("showcase authentication request failed\n")
        void sendWebResponse(res, authFailureResponse(cause)).catch(() =>
          respondWithInternalError(res),
        )
      })
      return
    }
    const dispatch = (): void => {
      if (isMockPath(url.pathname)) {
        serveMock(req, res).catch(() => {
          process.stderr.write("showcase mock request failed\n")
          respondWithInternalError(res)
        })
        return
      }
      const page = (): void => {
        render(req, res).catch((error: unknown) => {
          if (error instanceof MockScopeError) {
            sendStatus(res, 400, error.message)
            return
          }
          vite?.ssrFixStacktrace(error instanceof Error ? error : new Error(String(error)))
          process.stderr.write("showcase render request failed\n")
          respondWithInternalError(res)
        })
      }
      if (vite === undefined) page()
      else vite.middlewares(req, res, page)
    }
    if (
      url.pathname.startsWith("/api/") &&
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.method !== "OPTIONS"
    ) {
      const headers = new Headers({ cookie: req.headers.cookie ?? "" })
      const token = req.headers["x-csrf-token"]
      void Promise.resolve()
        .then(() =>
          auth.session.verifyCsrf(
            createRequestJar({ headers }).jar,
            typeof token === "string" ? token : "",
          ),
        )
        .then(
          (valid) => (valid ? dispatch() : sendWebResponse(res, csrfRejected())),
          (cause: unknown) => sendWebResponse(res, authFailureResponse(cause)),
        )
        .catch(() => respondWithInternalError(res))
    } else dispatch()
  })

  // Run Vite's HMR socket over this same HTTP server instead of its own standalone port. In
  // middleware mode Vite otherwise opens a separate WebSocket server that this harness never
  // closes, so a `^C` orphans it and the next start fails with `EADDRINUSE` on the HMR port.
  // A custom app has no `index.html` for Vite to crawl, so it would find dependencies one page at a
  // time and re-bundle them mid-session. A page loaded across that re-bundle mixes two copies of
  // React. Naming every browser entry, including the E2E fixtures, pre-bundles them all at start.
  // `warmup` transforms both graphs at start, so the first page load does not pay for them. A host
  // that `ui:capture` starts for a base commit gets its own dependency cache. The watcher skips
  // test output: a flow writes DOM snapshots mid-run, and watching them would reload the page
  // under test.
  if (built === undefined)
    vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server },
        watch: {
          ignored: ["**/.ui-artifacts/**", "**/test-results/**", "**/playwright-report/**"],
        },
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
    })

  // Close Vite (and its HMR socket) with the process so nothing is left bound after shutdown.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void (vite?.close() ?? Promise.resolve()).finally(() => {
        server.close(() => process.exit(0))
      })
    })
  }

  server.listen(PORT, HOST, () => {
    process.stdout.write(
      `showcase ${built === undefined ? "dev" : "gate"} server on http://${HOST}:${PORT}\n`,
    )
  })
}

void main()
