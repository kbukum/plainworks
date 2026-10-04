import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest"
import { GET, POST } from "./route"

const ORIGIN = "http://127.0.0.1:5299"
let root: string

beforeAll(() => {
  mkdirSync(".turbo", { recursive: true })
  root = mkdtempSync(".turbo/api-route-")
  vi.stubEnv("PLAINWORKS_DATA_DIR", root)
  vi.stubEnv("APP_ORIGIN", ORIGIN)
})

afterEach(() => {
  vi.stubEnv("NODE_ENV", "test")
})

afterAll(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

const total = async (): Promise<number> => {
  const response = await GET(new Request(`${ORIGIN}/api/tasks?limit=1`))
  return ((await response.json()) as { total: number }).total
}

const post = (path: string, body: unknown = {}) =>
  POST(
    new Request(`${ORIGIN}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  )

test("a task mutation without an active session reports terminal auth and changes nothing", async () => {
  const before = await total()
  const response = await post("/api/tasks", { title: "forged" })
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({
    code: "UNAUTHORIZED",
    reason: "SESSION_INVALID",
  })
  expect(await total()).toBe(before)
})

test("development mock control is a harness surface, not a session-guarded resource", async () => {
  expect((await post("/api/mock/reset")).status).toBe(200)
})

test("production never serves mock control", async () => {
  vi.stubEnv("NODE_ENV", "production")
  expect((await post("/api/mock/reset")).status).toBe(404)
  expect((await GET(new Request(`${ORIGIN}/api/mock/state`))).status).toBe(404)
})
