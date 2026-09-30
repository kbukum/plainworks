// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { useQuery } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { dehydrateClient, prefetchQuery } from "../hydration/prefetch"
import { createQueryClient } from "../query-client"
import { HydrationBoundary, isServerRuntime, QueryProvider } from "./provider"

afterEach(cleanup)

function Greeting(): ReactNode {
  const { data } = useQuery({ queryKey: ["greeting"], queryFn: async () => "fetched" })
  return createElement("p", null, `greeting: ${data ?? "loading"}`)
}

describe("isServerRuntime", () => {
  it("detects the browser (jsdom) as not-server", () => {
    expect(isServerRuntime()).toBe(false)
  })
})

describe("QueryProvider", () => {
  it("provides the injected client so hooks below read its cache", async () => {
    const client = createQueryClient()
    render(
      <QueryProvider client={client}>
        <Greeting />
      </QueryProvider>,
    )
    await waitFor(() => expect(screen.getByText("greeting: fetched")).toBeDefined())
  })

  it("hydrates a server-dehydrated cache with no loading flash and no refetch on mount", async () => {
    // Server: prefetch and dehydrate.
    const server = createQueryClient()
    await prefetchQuery<string>(server, {
      queryKey: ["greeting"],
      queryFn: async () => "from-server",
    })
    const state = dehydrateClient(server, { shouldDehydrateQuery: () => true })

    // Client: hydrate into the browser client under the provider; the value is warm on first
    // render.
    const browser = createQueryClient()
    render(
      <QueryProvider client={browser}>
        <HydrationBoundary state={state}>
          <Greeting />
        </HydrationBoundary>
      </QueryProvider>,
    )
    expect(screen.getByText("greeting: from-server")).toBeDefined()
    // The default stale time keeps the hydrated data fresh, so mounting starts no fetch.
    expect(browser.isFetching()).toBe(0)
  })

  it("wraps its children transparently with no accessibility violations", async () => {
    // The provider renders no DOM of its own — this asserts it adds no axe violations to the
    // accessible subtree it wraps (the floor for a `"use client"` binding).
    const { container } = render(
      <QueryProvider client={createQueryClient()}>
        <main>
          <h1>Items</h1>
          <button type="button">Refresh</button>
        </main>
      </QueryProvider>,
    )
    await expectNoAxeViolations(container)
  })
})
