import { MOCK_SCOPE_HEADER } from "@plainworks/mocks/scope"
import { type APIRequestContext, request as requests } from "@playwright/test"
import { expect, test } from "./support/gate"

// Every worker shares one host, so each test's data must stay in its own scope. A second scope
// running at the same time must not see this test's change, while a context naming the same scope
// must, which proves the scope header is what keeps them apart.

async function scopedRequest(
  baseURL: string | undefined,
  scope: string,
): Promise<APIRequestContext> {
  if (baseURL === undefined) throw new Error("The gate gives every test a base URL.")
  return requests.newContext({ baseURL, extraHTTPHeaders: { [MOCK_SCOPE_HEADER]: scope } })
}

async function usersStatus(request: APIRequestContext): Promise<number> {
  return (await request.get("/api/users")).status()
}

test("keeps each test's data in its own scope on the shared host", async ({
  page,
  request,
  baseURL,
  gateScope,
  runtimeErrors,
}) => {
  expect(gateScope).toBeDefined()
  // The page's own request below fails on purpose.
  runtimeErrors.allow(/status of 500/)
  const other = await scopedRequest(baseURL, crypto.randomUUID())
  const same = await scopedRequest(baseURL, gateScope ?? "")
  try {
    expect((await request.post("/mock/error", { data: { enabled: true } })).ok()).toBe(true)
    const [own, sibling, shared] = await Promise.all([
      usersStatus(request),
      usersStatus(other),
      usersStatus(same),
    ])
    expect({ own, sibling, shared }).toEqual({ own: 500, sibling: 200, shared: 500 })

    // The page's own requests carry the test's scope too.
    expect(await page.evaluate(async () => (await fetch("/api/users")).status)).toBe(500)
    expect((await other.delete("/mock/scope")).ok()).toBe(true)
  } finally {
    await request.post("/mock/error", { data: { enabled: false } })
    await Promise.all([other.dispose(), same.dispose()])
  }
})

test("rejects a malformed scope instead of serving shared data", async ({ baseURL }) => {
  const bad = await scopedRequest(baseURL, "not a scope")
  try {
    const response = await bad.get("/api/users")
    expect(response.status()).toBe(400)
    expect(response.headers()["content-type"]).toContain("application/problem+json")
  } finally {
    await bad.dispose()
  }
})
