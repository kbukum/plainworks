// @vitest-environment jsdom

import { deserializeSnapshot } from "@plainworks/app"
import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { createQueryClient, type DehydratedState } from "@plainworks/query"
import { act } from "react"
import { hydrateRoot } from "react-dom/client"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
  QUERY_STATE_SCRIPT_ID,
  ROOT_ELEMENT_ID,
  SNAPSHOT_SCRIPT_ID,
  THEME_COOKIE,
} from "../app/constants"
import { renderApp } from "../server/render"
import { buildClientCapabilities } from "./capabilities"
import { createDemoTransport } from "./live-stream"
import { Showcase } from "./showcase"
import { createLiveTasksSource, createThemeSource } from "./sources"

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

function readEmbedded(id: string): string {
  const text = document.getElementById(id)?.textContent
  if (text == null || text.length === 0) {
    throw new Error(`Missing embedded payload #${id}`)
  }
  return text
}

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => {
  // jsdom has no `matchMedia`; the theme provider reads it in an effect. A stable light default
  // matches the server's light-first resolution, so the effect cannot introduce a mismatch.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
})
afterEach(() => {
  handle.server.resetHandlers()
  handle.api.reset()
  vi.unstubAllGlobals()
})
afterAll(() => handle.server.close())

describe("hydration", () => {
  it("hydrates the server markup with no React mismatch", async () => {
    const { html } = await renderApp({
      path: "/tasks",
      cookieHeader: themeCookie("light", "indigo"),
      httpClient: createHttpClient({ baseUrl: "http://showcase.test" }),
      clientEntry: CLIENT_ENTRY,
      readSession: async () => ({ authenticated: true, subject: "user-123", name: "Ada" }),
    })

    document.open()
    document.write(html)
    document.close()

    const snapshot = deserializeSnapshot(readEmbedded(SNAPSHOT_SCRIPT_ID))
    const dehydratedState = JSON.parse(readEmbedded(QUERY_STATE_SCRIPT_ID)) as DehydratedState
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
      queryClient: createQueryClient(),
      themeSource: createThemeSource(),
    })
    const liveSource = createLiveTasksSource()

    const rootHandle = await act(async () =>
      hydrateRoot(
        root,
        <Showcase
          capabilities={capabilities}
          snapshot={snapshot}
          dehydratedState={dehydratedState}
          httpClient={createHttpClient({ baseUrl: "http://showcase.test" })}
          liveSource={liveSource}
          initialPath="/tasks"
          transport={createDemoTransport()}
        />,
      ),
    )

    errorSpy.mockRestore()
    warnSpy.mockRestore()

    const mismatches = errors.filter((args) =>
      args.some((arg) => typeof arg === "string" && /hydrat|did not match|mismatch/i.test(arg)),
    )
    expect(mismatches).toEqual([])
    expect(errors).toEqual([])

    act(() => rootHandle.unmount())
  })
})
