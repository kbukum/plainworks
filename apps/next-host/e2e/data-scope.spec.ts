import { MOCK_SCOPE_HEADER } from "@plainworks/mocks/scope"
import { type APIRequestContext, request as requests } from "@playwright/test"
import { expect, test } from "./support/gate"

// Every worker shares one `next dev`, so each test's data must stay in its own scope. A second
// scope running at the same time must not see this test's change, while a context naming the same
// scope must, which proves the scope header is what keeps them apart. The server prefetch must
// read the same scope as the browser.

async function scopedRequest(
  baseURL: string | undefined,
  scope: string,
): Promise<APIRequestContext> {
  if (baseURL === undefined) throw new Error("The gate gives every test a base URL.")
  return requests.newContext({ baseURL, extraHTTPHeaders: { [MOCK_SCOPE_HEADER]: scope } })
}

// The task table's accessible name, present in the HTML only when the server prefetch succeeded.
const TASK_TABLE = "Tasks, highest priority first"

async function tasksStatus(request: APIRequestContext): Promise<number> {
  return (await request.get("/api/tasks")).status()
}

test("keeps each test's data in its own scope on the shared host", async ({
  page,
  request,
  baseURL,
  gateScope,
}) => {
  expect(gateScope).toBeDefined()
  const other = await scopedRequest(baseURL, crypto.randomUUID())
  const same = await scopedRequest(baseURL, gateScope ?? "")
  try {
    expect((await request.post("/api/mock/error", { data: { enabled: true } })).ok()).toBe(true)
    const [own, sibling, shared] = await Promise.all([
      tasksStatus(request),
      tasksStatus(other),
      tasksStatus(same),
    ])
    expect({ own, sibling, shared }).toEqual({ own: 500, sibling: 200, shared: 500 })

    // The server prefetch reads this scope too: while it fails, the page ships no task table, and
    // once the scope recovers, the table is server-rendered again.
    const serverHasTable = async () =>
      (await (await page.request.get("/tasks")).text()).includes(TASK_TABLE)
    expect(await serverHasTable()).toBe(false)
    expect((await request.post("/api/mock/error", { data: { enabled: false } })).ok()).toBe(true)
    expect(await serverHasTable()).toBe(true)
    expect((await other.delete("/api/mock/scope")).ok()).toBe(true)
  } finally {
    await request.post("/api/mock/error", { data: { enabled: false } })
    await Promise.all([other.dispose(), same.dispose()])
  }
})

test("rejects a malformed scope instead of serving shared data", async ({ baseURL }) => {
  const bad = await scopedRequest(baseURL, "not a scope")
  try {
    const response = await bad.get("/api/tasks")
    expect(response.status()).toBe(400)
    expect(response.headers()["content-type"]).toContain("application/problem+json")
  } finally {
    await bad.dispose()
  }
})
