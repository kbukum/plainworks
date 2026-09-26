import { describe, expect, it } from "vitest"
import { createQueryClient, DEFAULT_QUERY_STALE_TIME_MS } from "./query-client"

describe("createQueryClient", () => {
  it("returns a fresh client each call (never a shared singleton)", () => {
    const a = createQueryClient()
    const b = createQueryClient()
    expect(a).not.toBe(b)
  })

  it("keeps hydrated data fresh by default so the browser does not refetch on mount", () => {
    const client = createQueryClient()
    expect(DEFAULT_QUERY_STALE_TIME_MS).toBeGreaterThan(0)
    expect(client.getDefaultOptions().queries?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS)
  })

  it("lets supplied defaults win and keeps the rest of them", () => {
    const client = createQueryClient({
      defaultOptions: { queries: { staleTime: 1234, retry: 1 }, mutations: { retry: 0 } },
    })
    expect(client.getDefaultOptions().queries?.staleTime).toBe(1234)
    expect(client.getDefaultOptions().queries?.retry).toBe(1)
    expect(client.getDefaultOptions().mutations?.retry).toBe(0)
  })

  it("keeps the default stale time when only other query defaults are supplied", () => {
    const client = createQueryClient({ defaultOptions: { queries: { retry: 2 } } })
    expect(client.getDefaultOptions().queries?.staleTime).toBe(DEFAULT_QUERY_STALE_TIME_MS)
    expect(client.getDefaultOptions().queries?.retry).toBe(2)
  })
})
