import type { WebFetch } from "@plainworks/std"
import { fakeFetch } from "@plainworks/testkit"
import { expect, test } from "vitest"
import { createHttpClient } from "./client"

/**
 * The `fetch` seam's supported injection paths must type-check **without a cast**. Native DOM
 * `fetch` is deliberately *not* directly assignable to the host-independent `WebFetch` seam (its
 * `RequestInit` re-introduces DOM shapes — `AbortSignal.onabort`/`dispatchEvent`, `Headers`
 * `getSetCookie` — that "assume no host" cannot name), so a consumer either lets the client use the
 * platform default, writes a function to the `WebFetch` contract (the natural wrapper shape), or
 * adapts native `fetch` at that one boundary. These cases lock the two cast-free paths in place; if
 * a change broke them this test would fail to compile.
 */

test("a WebFetch-conforming function injects without a cast", () => {
  // A wrapper written to the seam contract — the shape instrumentation/auth wrappers already use.
  const wrapped: WebFetch = (input, init) => fetch(input, init)
  const client = createHttpClient({ baseUrl: "https://api.test", fetch: wrapped })
  expect(typeof client.request).toBe("function")
})

test("the testkit fetch fake injects without a cast", () => {
  const { fetch: fake } = fakeFetch([])
  const client = createHttpClient({ baseUrl: "https://api.test", fetch: fake })
  expect(typeof client.request).toBe("function")
})

test("the default construction uses the platform fetch cast-free", () => {
  // No `fetch` option: the client resolves the shim-bound global (already typed as `WebFetch`), so
  // the common path needs no injection and no cast at all.
  const client = createHttpClient({ baseUrl: "https://api.test" })
  expect(typeof client.request).toBe("function")
})
