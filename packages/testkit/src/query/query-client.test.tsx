// @vitest-environment jsdom

import { QueryClient, useQueryClient } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { expectNoAxeViolations } from "../client"
import { createTestQueryClient, TestQueryClientProvider } from "./query-client"

function QueryState() {
  const client = useQueryClient()
  return <output>{String(client.getDefaultOptions().queries?.retry)}</output>
}

describe("query test harness", () => {
  it("creates an isolated client with retries disabled", () => {
    const first = createTestQueryClient((options) => new QueryClient(options))
    const second = createTestQueryClient((options) => new QueryClient(options))

    expect(first).not.toBe(second)
    expect(first.getDefaultOptions().queries?.retry).toBe(false)
  })

  it("preserves defaults supplied by the runtime factory", () => {
    const client = createTestQueryClient(
      (options) =>
        new QueryClient({
          ...options,
          defaultOptions: {
            ...options?.defaultOptions,
            queries: { staleTime: 60_000, ...options?.defaultOptions?.queries },
          },
        }),
    )
    expect(client.getDefaultOptions().queries?.staleTime).toBe(60_000)
  })

  it("provides a caller-owned client", async () => {
    const client = createTestQueryClient((options) => new QueryClient(options))
    const { container } = render(
      <TestQueryClientProvider client={client}>
        <QueryState />
      </TestQueryClientProvider>,
    )

    expect(screen.getByRole("status").textContent).toBe("false")
    await expectNoAxeViolations(container)
  })
})
