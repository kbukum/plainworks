import { writeFile } from "node:fs/promises"
import { createBrowserGate } from "@plainworks/testkit/playwright"
import {
  expect,
  type Page,
  request as playwrightRequest,
  type Request,
  type Response,
} from "@playwright/test"
import {
  AUTH_USERNAME,
  authFixture,
  authHost,
  authScenario,
  resetAuthHost,
  statusPending,
} from "./auth-host"

/**
 * Real browser session acceptance against the pinned gokit auth HTTPS host. Every journey drives
 * the published `@plainworks/*` browser lifecycle through a real Chromium context: opaque cookie
 * login, authoritative status, protected Connect, protected SSE, CSRF-enforced logout, and the
 * terminal/operational/race failures that must never leave a fabricated authenticated client. No
 * mock auth server, MSW, or RPC interception is used.
 */

async function signIn(page: Page): Promise<void> {
  await page.goto("/")
  await expect(page.getByLabel("app-ready")).toHaveText("ready")
  await page.getByLabel("Username").fill(AUTH_USERNAME)
  await page.getByLabel("Password").fill(authFixture().password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page.getByLabel("login-state")).toHaveText("ok")
  await expect(page.getByLabel("Password")).toHaveValue("")
  await expect(page.getByLabel("auth-state")).toHaveText(/^authenticated/)
}

const test = createBrowserGate({
  host: authHost(),
  resetHost: resetAuthHost,
  signIn,
  now: null,
})

async function assertNoCredentialExposure(page: Page): Promise<void> {
  const cookies = await page.context().cookies()
  const session = cookies.find((cookie) => cookie.name === "__Host-session")
  expect(session, "opaque session cookie is set").toBeDefined()
  expect(session?.httpOnly).toBe(true)
  expect(session?.secure).toBe(true)
  expect(session?.sameSite).toBe("Strict")
  expect(session?.path).toBe("/")
  const exposure = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
    cookie: document.cookie,
  }))
  expect(exposure.local).toBe("{}")
  expect(exposure.session).toBe("{}")
  expect(exposure.cookie).not.toContain("__Host-session")
  expect(page.url()).not.toMatch(/[A-Za-z0-9_-]{43,}/)
}

async function openEvents(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open events" }).click()
  await expect(page.getByLabel("events-state")).toHaveText(/status=open ready=true/)
}

async function expectTerminal(page: Page, started: number): Promise<void> {
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/, { timeout: 1_000 })
  await expect(page.getByLabel("events-state")).toHaveText(/status=closed ready=false/, {
    timeout: 1_000,
  })
  expect(Date.now() - started, "terminal protected work settles within one second").toBeLessThan(
    1_000,
  )
}

test("login, authoritative status, Connect WhoAmI, SSE, and CSRF logout", async ({ page }) => {
  await assertNoCredentialExposure(page)

  await page.getByRole("button", { name: "Check status" }).click()
  await expect(page.getByLabel("status-result")).toHaveText("ok")
  await expect(page.getByLabel("auth-state")).toHaveText(
    new RegExp(`^authenticated ${AUTH_USERNAME}`),
  )

  await page.getByRole("button", { name: "Who am I" }).click()
  await expect(page.getByLabel("whoami-result")).toHaveText(`user:${AUTH_USERNAME}`)

  await page.getByRole("button", { name: "Open events" }).click()
  await expect(page.getByLabel("events-state")).toHaveText(/status=open ready=true/, {
    timeout: 15_000,
  })
  const started = Date.now()
  await page.getByRole("button", { name: "Sign out" }).click()
  await expectTerminal(page, started)
  await expect(page.getByLabel("logout-state")).toHaveText("confirmed")
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/)

  await page.getByRole("button", { name: "Who am I" }).click()
  await expect(page.getByLabel("whoami-result")).toHaveText(/^error=/)
})

test("expiry is terminal and stops protected access", async ({ page, request, runtimeErrors }) => {
  runtimeErrors.allow(/Failed to load resource/)
  await openEvents(page)
  await authScenario(request, "expired")

  const started = Date.now()
  await page.getByRole("button", { name: "Check status" }).click()
  await expectTerminal(page, started)
  await expect(page.getByLabel("status-result")).toHaveText(/^error=/)
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/)

  await page.getByRole("button", { name: "Who am I" }).click()
  await expect(page.getByLabel("whoami-result")).toHaveText(/^error=/)
})

test("CSRF denial leaves the authoritative session usable", async ({ page, runtimeErrors }) => {
  runtimeErrors.allow(/Failed to load resource/)
  const denied = await page.request.post("/auth/logout", {
    headers: { Origin: new URL(page.url()).origin },
    data: {},
    timeout: 2_000,
  })
  expect(denied.status()).toBe(403)
  const status = await page.request.get("/auth/session", { timeout: 1_000 })
  expect(status.status()).toBe(200)
  await page.getByRole("button", { name: "Who am I" }).click()
  await expect(page.getByLabel("whoami-result")).toHaveText(`user:${AUTH_USERNAME}`)
})

test("external family revocation closes a live stream and rejects the retained cookie", async ({
  page,
  runtimeErrors,
}, testInfo) => {
  runtimeErrors.allow(/Failed to load resource/)
  const observationStarted = Date.now()
  const observations: { path: string; event: string; elapsedMs: number }[] = []
  const record = (url: string, event: string): void => {
    observations.push({
      path: new URL(url).pathname,
      event,
      elapsedMs: Date.now() - observationStarted,
    })
  }
  const response = (value: Response): void => record(value.url(), `response:${value.status()}`)
  const finished = (value: Request): void => record(value.url(), "finished")
  page.on("response", response)
  page.on("requestfinished", finished)
  await openEvents(page)
  const external = await playwrightRequest.newContext({
    baseURL: new URL(page.url()).origin,
    storageState: await page.context().storageState(),
    extraHTTPHeaders: { Origin: new URL(page.url()).origin },
  })
  try {
    const status = await external.get("/auth/session", { timeout: 1_000 })
    expect(status.status()).toBe(200)
    const session: unknown = await status.json()
    if (
      typeof session !== "object" ||
      session === null ||
      !("csrfToken" in session) ||
      typeof session.csrfToken !== "string"
    )
      throw new Error("Authoritative status omitted the CSRF proof")
    const started = Date.now()
    const logout = await external.post("/auth/logout", {
      headers: { "X-CSRF-Token": session.csrfToken },
      data: {},
      timeout: 2_000,
    })
    expect(logout.status()).toBe(204)
    await expectTerminal(page, started)
    const retained = await page.request.get("/auth/session", { timeout: 1_000 })
    expect(retained.status()).toBe(401)
    await page.getByRole("button", { name: "Who am I" }).click()
    await expect(page.getByLabel("whoami-result")).toHaveText(/^error=/)
  } finally {
    await external.dispose()
    page.off("response", response)
    page.off("requestfinished", finished)
    const path = testInfo.outputPath("revocation-observations.json")
    await writeFile(
      path,
      JSON.stringify({
        observations,
        events: await page.getByLabel("events-state").textContent(),
      }),
    )
    await testInfo.attach("revocation-observations", { path, contentType: "application/json" })
  }
})

test("unconfirmed logout stops local work without claiming remote revocation", async ({
  page,
  request,
  runtimeErrors,
}) => {
  runtimeErrors.allow(/Failed to load resource/)
  await openEvents(page)
  await authScenario(request, "unavailable-store")
  const started = Date.now()
  await page.getByRole("button", { name: "Sign out" }).click()
  await expectTerminal(page, started)
  await expect(page.getByLabel("logout-state")).toHaveText(/^unconfirmed=/, { timeout: 2_000 })
  await authScenario(request, "healthy-store")
  const remote = await page.request.get("/auth/session", { timeout: 1_000 })
  expect(remote.status(), "failed revocation did not delete the backend session").toBe(200)
  await expect(page.getByLabel("auth-state")).toHaveText(/revocation=unconfirmed/)
})

test("logout revokes the family and a later status cannot re-authenticate", async ({
  page,
  runtimeErrors,
}) => {
  runtimeErrors.allow(/Failed to load resource/)
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page.getByLabel("logout-state")).toHaveText("confirmed")

  await page.getByRole("button", { name: "Check status" }).click()
  await expect(page.getByLabel("status-result")).toHaveText(/^error=/)
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/)
})

test("an unavailable store is an operational failure, never authenticated success", async ({
  page,
  request,
  runtimeErrors,
}) => {
  runtimeErrors.allow(/Failed to load resource/)
  await authScenario(request, "unavailable-store")

  await page.getByRole("button", { name: "Check status" }).click()
  await expect(page.getByLabel("status-result")).toHaveText(/^error=/)
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/)

  await page.getByRole("button", { name: "Who am I" }).click()
  await expect(page.getByLabel("whoami-result")).toHaveText(/^error=/)

  await authScenario(request, "healthy-store")
})

test("an owned outage fails closed and recovery requires a fresh login", async ({
  page,
  gateHost,
  runtimeErrors,
}) => {
  runtimeErrors.allow(/net::ERR_CONNECTION_REFUSED|Failed to fetch|Failed to load resource/)
  if (gateHost === undefined) throw new Error("Outage requires an owned host.")

  await gateHost.stop()
  await page.getByRole("button", { name: "Who am I" }).click()
  await expect(page.getByLabel("whoami-result")).toHaveText(/^error=/)
  await page.getByRole("button", { name: "Check status" }).click()
  await expect(page.getByLabel("status-result")).toHaveText(/^error=/)
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/)

  await gateHost.restart()
  await signIn(page)
  await page.getByRole("button", { name: "Who am I" }).click()
  await expect(page.getByLabel("whoami-result")).toHaveText(`user:${AUTH_USERNAME}`)
})

test("a held status racing logout cannot restore the logged-out session", async ({
  page,
  request,
  runtimeErrors,
}) => {
  runtimeErrors.allow(/Failed to load resource/)
  await authScenario(request, "hold-status")

  await page.getByRole("button", { name: "Check status" }).click()
  await expect.poll(() => statusPending(request), { timeout: 3_000 }).toBe(true)

  await page.getByRole("button", { name: "Sign out" }).click()
  await authScenario(request, "release-status")
  await expect(page.getByLabel("logout-state")).toHaveText("confirmed")
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/)

  await page.getByRole("button", { name: "Check status" }).click()
  await expect(page.getByLabel("status-result")).toHaveText(/^error=/)
  await expect(page.getByLabel("auth-state")).toHaveText(/^unauthenticated/)
})
