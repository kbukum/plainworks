import { createConnectQueryKey } from "@connectrpc/connect-query-core"
import { EchoService } from "@plainworks/testkit/connect"
import { fakeCacheInvalidator } from "@plainworks/testkit/fakes"
import { describe, expect, test } from "vitest"
import { createMethodInvalidator } from "./invalidate"

const echo = EchoService.method.echo

function seed(cache: ReturnType<typeof fakeCacheInvalidator>, input?: { message: string }) {
  const scope = input !== undefined ? { input } : {}
  const finite = createConnectQueryKey({ schema: echo, cardinality: "finite", ...scope })
  const infinite = createConnectQueryKey({ schema: echo, cardinality: "infinite", ...scope })
  cache.seed(finite)
  cache.seed(infinite)
  return { finite, infinite }
}

describe("createMethodInvalidator", () => {
  test("matches both finite and infinite queries for the method", async () => {
    const cache = fakeCacheInvalidator()
    const { finite, infinite } = seed(cache)

    await createMethodInvalidator(cache)(echo)

    expect(cache.isStale(finite)).toBe(true)
    expect(cache.isStale(infinite)).toBe(true)
  })

  test("restricts invalidation to a specific input when given", async () => {
    const cache = fakeCacheInvalidator()
    const ping = seed(cache, { message: "ping" })
    const pong = seed(cache, { message: "pong" })

    await createMethodInvalidator(cache)(echo, { input: { message: "ping" } })

    expect(cache.isStale(ping.finite)).toBe(true)
    expect(cache.isStale(pong.finite)).toBe(false)
  })

  test("forwards the abort signal to the cache", async () => {
    const signals: unknown[] = []
    const invalidate = createMethodInvalidator({
      invalidate: async (_target, options) => {
        signals.push(options?.signal)
      },
    })
    const controller = new AbortController()

    await invalidate(echo, { signal: controller.signal })

    expect(signals).toEqual([controller.signal])
  })
})
