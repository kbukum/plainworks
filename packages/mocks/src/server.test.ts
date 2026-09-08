import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMockApi } from "./api"
import { createMockServer, createMockServerHandle } from "./server"

describe("createMockServer", () => {
  it("intercepts requests for the handlers of the api it is given", async () => {
    const api = createMockApi({ seed: 1 })
    const server = createMockServer(api)
    server.listen({ onUnhandledRequest: "error" })
    try {
      const response = await fetch("http://mock.test/api/users?pageSize=2")
      expect(response.status).toBe(200)
      const body = (await response.json()) as { data: unknown[] }
      expect(body.data.length).toBeLessThanOrEqual(2)
    } finally {
      server.close()
    }
  })
})

describe("createMockServerHandle", () => {
  const handle = createMockServerHandle({ seed: 7 })

  beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
  afterEach(() => {
    handle.server.resetHandlers()
    handle.api.reset()
  })
  afterAll(() => handle.server.close())

  it("pairs a server with the api it serves so a test can reach both", async () => {
    const response = await fetch("http://mock.test/api/users?pageSize=3")
    const body = (await response.json()) as { data: { id: string }[] }
    // The same rows are reachable programmatically through the paired api.
    const stored = handle.api.stores.users.getAll().slice(0, 3)
    expect(body.data.map((row) => row.id)).toEqual(stored.map((row) => row.id))
  })

  it("reset() rewinds the seeded state deterministically between cases", () => {
    const before = handle.api.stores.users.getAll().map((row) => row.id)
    handle.api.stores.users.remove(0)
    handle.api.reset()
    const after = handle.api.stores.users.getAll().map((row) => row.id)
    expect(after).toEqual(before)
  })
})
