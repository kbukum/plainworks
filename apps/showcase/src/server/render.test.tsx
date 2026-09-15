import { createHttpClient } from "@plainworks/http"
import { createMockServerHandle } from "@plainworks/mocks/server"
import { createMockIdp } from "@plainworks/testkit"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createShowcaseAuth, type ShowcaseAuth } from "../app/auth"
import { SNAPSHOT_SCRIPT_ID, THEME_COOKIE } from "../app/constants"
import { renderApp } from "./render"

// The SSR render proven the way a consumer assembles the kit: the composition kernel resolves the
// snapshot (theme + session), `@plainworks/query` prefetches the task list through
// `@plainworks/http`, and `@plainworks/mocks` (MSW) stands in for the backend. The session is read
// through `@plainworks/auth`'s own `createServerSession`, and an in-process mock IdP mints a real
// signed session for the authenticated cases.

const handle = createMockServerHandle({ seed: 7 })
const CLIENT_ENTRY = "/src/client/entry-client.tsx"
const REDIRECT_URI = "https://showcase.test/auth/callback"

let auth: ShowcaseAuth
let idp: Awaited<ReturnType<typeof createMockIdp>>
let sessionCookie: string

function themeCookie(mode: string, colorScheme: string): string {
  return `${THEME_COOKIE}=${encodeURIComponent(JSON.stringify({ mode, colorScheme }))}`
}

function render(path: string, cookieHeader: string) {
  const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })
  return renderApp({
    path,
    cookieHeader,
    httpClient,
    clientEntry: CLIENT_ENTRY,
    readSession: auth.read,
  })
}

/** Fold a batch of `Set-Cookie` entries into the inbound jar the way a browser would. */
function applyCookies(setCookies: readonly string[], inbound: Map<string, string>): void {
  for (const cookie of setCookies) {
    const eq = cookie.indexOf("=")
    const semi = cookie.indexOf(";")
    const name = cookie.slice(0, eq)
    const value = cookie.slice(eq + 1, semi === -1 ? undefined : semi)
    if (/Max-Age=0(?:;|$)/.test(cookie)) {
      inbound.delete(name)
    } else {
      inbound.set(name, value)
    }
  }
}

/** Drive a real login round-trip and return the resulting `Cookie` header (session + CSRF). */
async function mintSessionCookie(): Promise<string> {
  const inbound = new Map<string, string>()
  let outbound: string[] = []
  const jar = {
    get: (name: string) => inbound.get(name),
    set: (cookie: string) => outbound.push(cookie),
  }
  const begin = await auth.session.beginLogin(jar, { returnTo: "/tasks" })
  applyCookies(outbound, inbound)
  outbound = []
  const { callbackUrl } = idp.authorize(begin.authorizationUrl)
  const params = Object.fromEntries(new URL(callbackUrl).searchParams)
  await auth.session.completeLogin(jar, { params })
  applyCookies(outbound, inbound)
  return [...inbound].map(([name, value]) => `${name}=${value}`).join("; ")
}

beforeAll(async () => {
  handle.server.listen({ onUnhandledRequest: "error" })
  idp = await createMockIdp()
  auth = createShowcaseAuth({
    fetch: idp.fetch,
    issuer: idp.issuer,
    clientId: idp.clientId,
    redirectUri: REDIRECT_URI,
    signingKey: new Uint8Array(32).fill(7),
  })
  sessionCookie = await mintSessionCookie()
})
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("session gate", () => {
  it("redirects an unauthenticated request to the login route with a sanitized return target", async () => {
    const { status, location, html } = await render("/tasks", themeCookie("dark", "violet"))
    expect(status).toBe(302)
    expect(location).toBe(`/login?returnTo=${encodeURIComponent("/tasks")}`)
    expect(html).toBe("")
  })

  it("preserves query state in the login redirect for unauthenticated requests", async () => {
    const { status, location, html } = await render(
      "/tasks?page=2&filter=active",
      themeCookie("dark", "violet"),
    )
    expect(status).toBe(302)
    expect(location).toBe(`/login?returnTo=${encodeURIComponent("/tasks?page=2&filter=active")}`)
    expect(html).toBe("")
  })

  it("renders the dashboard for a request carrying a valid session cookie", async () => {
    const { status, html } = await render(
      "/tasks",
      `${themeCookie("light", "indigo")}; ${sessionCookie}`,
    )
    expect(status).toBe(200)
    expect(html).toContain("Signed in as")
    expect(html).toContain("user-123")
  })
})

describe("server render", () => {
  it("embeds the resolved app snapshot in the HTML for the client to hydrate from", async () => {
    const { html, status } = await render(
      "/tasks",
      `${themeCookie("dark", "violet")}; ${sessionCookie}`,
    )

    expect(status).toBe(200)
    // The snapshot rides an inline JSON script under its stable id, carrying the theme capability's
    // resolved slice the client deserializes and hands to `AppProvider`.
    expect(html).toContain(`id="${SNAPSHOT_SCRIPT_ID}"`)
    expect(html).toContain('"colorScheme":"violet"')
    expect(html).toContain('"mode":"dark"')
  })

  it("renders the query-prefetched task rows into the server markup (no client refetch needed)", async () => {
    const seeded = handle.api.stores.tasks.getAll()
    const { html } = await render("/tasks", `${themeCookie("light", "indigo")}; ${sessionCookie}`)

    // At least one seeded task title appears in the server HTML, proving the prefetched cache
    // rendered on the server — the list is warm before the browser boots.
    expect(seeded.length).toBeGreaterThan(0)
    expect(seeded.some((task) => html.includes(task.title))).toBe(true)
  })

  it("writes the zero-flash theme class onto <html> from the theme cookie", async () => {
    const dark = await render("/tasks", `${themeCookie("dark", "violet")}; ${sessionCookie}`)
    // `resolveTheme({ mode: "dark", colorScheme: "violet" })` → `dark theme-violet`.
    expect(dark.html).toContain('<html lang="en" class="dark theme-violet">')

    const light = await render("/tasks", `${themeCookie("light", "emerald")}; ${sessionCookie}`)
    expect(light.html).toContain('<html lang="en" class="theme-emerald">')
  })

  it("falls back to the default theme when no theme cookie is present", async () => {
    const { html } = await render("/tasks", sessionCookie)
    // Default is `{ mode: "system", colorScheme: "indigo" }`; system resolves light server-side.
    expect(html).toContain('<html lang="en" class="theme-indigo">')
  })

  it("normalizes path with query parameters so the Tasks branch renders without mismatch", async () => {
    const { status, html } = await render(
      "/tasks?filter=open",
      `${themeCookie("light", "indigo")}; ${sessionCookie}`,
    )
    expect(status).toBe(200)
    expect(html).toContain("<h1>Tasks</h1>")
    expect(html).not.toContain("<h1>Overview</h1>")
  })
})
