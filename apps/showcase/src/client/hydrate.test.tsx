// @vitest-environment jsdom

import { readHydration } from "@plainworks/app/hydration"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { bindMockServerLifecycle } from "@plainworks/mocks/lifecycle"
import { createQueryClient } from "@plainworks/query"
import { installMatchMedia } from "@plainworks/testkit/client"
import { createTestQueryClient } from "@plainworks/testkit/query"
import { act } from "react"
import { hydrateRoot } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ROOT_ELEMENT_ID, THEME_COOKIE } from "../neutral/constants"
import { renderApp } from "../server/render"
import { buildClientCapabilities, Showcase } from "./bootstrap"

// Proves the zero-mismatch contract end to end: the server markup and the client's first render of
// the SAME `<Showcase>` tree — hydrated from the SAME embedded snapshot and dehydrated cache —
// agree exactly, so React logs no hydration warning. A mismatch is a `console.error` in React, so
// the test fails loudly if one fires.

const handle = createMockServerHandle({ seed: 7 })
const CLIENT_ENTRY = "/src/client/entry-client.tsx"

// React's `act` requires this flag when used outside a test renderer that sets it (RTL sets it for
// its own `render`; here we drive `hydrateRoot` directly).
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function themeCookie(mode: string, colorScheme: string): string {
  return `${THEME_COOKIE}=${encodeURIComponent(JSON.stringify({ mode, colorScheme }))}`
}

bindMockServerLifecycle(handle.server, { hooks: { beforeAll, afterEach, afterAll } })
beforeEach(() => {
  // jsdom has no `matchMedia`; install the shared deterministic fake.
  installMatchMedia()
})
afterEach(() => {
  handle.api.reset()
  vi.unstubAllGlobals()
})

describe("hydration", () => {
  it("hydrates the server markup with no React mismatch", async () => {
    const { html } = await renderApp({
      path: "/tasks",
      cookieHeader: themeCookie("light", "indigo"),
      httpClient: createHttpClient({ baseUrl: "http://showcase.test" }),
      stylesheets: ["/src/client/styles.css"],
      clientEntry: CLIENT_ENTRY,
      readSession: async () => ({ authenticated: true, subject: "user-123", name: "Ada" }),
    })

    document.open()
    document.write(html)
    document.close()

    const { snapshot, query } = readHydration(document)
    const root = document.getElementById(ROOT_ELEMENT_ID)
    if (root === null) {
      throw new Error("missing root")
    }

    const errors: unknown[][] = []
    const errorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args)
    })
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
      errors.push(args)
    })

    const capabilities = buildClientCapabilities({
      queryClient: createTestQueryClient(createQueryClient),
      httpClient: createHttpClient({ baseUrl: "http://showcase.test" }),
    })

    const rootHandle = await act(async () =>
      hydrateRoot(
        root,
        <Showcase
          capabilities={capabilities}
          snapshot={snapshot}
          dehydratedState={query}
          initialPath="/tasks"
        />,
      ),
    )

    errorSpy.mockRestore()
    warnSpy.mockRestore()

    const mismatches = errors.filter((args) =>
      args.some((arg) => typeof arg === "string" && /hydrat|did not match|mismatch/i.test(arg)),
    )
    // This test runs the server and browser renderers in one JavaScript realm. A real request and
    // browser hydration use separate realms, so React's shared-context renderer warning is
    // test-only.
    const unexpectedErrors = errors.filter(
      (args) =>
        !args.some(
          (arg) =>
            arg ===
            "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported.",
        ),
    )
    expect(mismatches).toEqual([])
    expect(unexpectedErrors).toEqual([])

    act(() => rootHandle.unmount())
  })
})
