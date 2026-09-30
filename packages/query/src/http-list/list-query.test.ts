import { createHttpClient, HttpError } from "@plainworks/http"
import type { PaginatedResult } from "@plainworks/std/list"
import type { WebFetch, WebRequestInit, WebResponse } from "@plainworks/std/web"
import { describe, expect, it } from "vitest"
import { listQueryKey } from "../list"
import { createQueryClient } from "../query-client"
import { httpListQuery } from "./list-query"

interface Item {
  readonly id: string
}

const isItem = (value: unknown): value is Item =>
  typeof value === "object" && value !== null && typeof (value as Item).id === "string"

const page: PaginatedResult<Item> = {
  data: [{ id: "a" }, { id: "b" }],
  pagination: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
}

function fakeServer(respond: () => WebResponse) {
  const calls: { url: string; init: WebRequestInit | undefined }[] = []
  const fetch: WebFetch = async (input, init) => {
    calls.push({ url: String(input), init })
    return respond()
  }
  return { calls, client: createHttpClient({ baseUrl: "https://api.test", fetch }) }
}

const items = httpListQuery<Item>({ path: "/api/items", resource: "items", row: isItem })

describe("httpListQuery", () => {
  it("reads one page with the list query string and validates it", async () => {
    const { calls, client } = fakeServer(() => Response.json(page))
    const result = await items.read(client, { page: 1, pageSize: 2, search: "x" })
    expect(result).toEqual(page)
    const url = new URL(calls[0]?.url ?? "")
    expect(url.pathname).toBe("/api/items")
    expect(url.searchParams.get("search")).toBe("x")
  })

  it("rejects a page with an invalid row", async () => {
    const { client } = fakeServer(() => Response.json({ ...page, data: [{ id: 1 }] }))
    const error = await items.read(client, { page: 1 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).kind).toBe("http/validate")
  })

  it("rejects a bodyless response as a decode failure", async () => {
    const { client } = fakeServer(() => new Response(null, { status: 204 }))
    const error = await items.read(client, { page: 1 }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect((error as HttpError).kind).toBe("http/decode")
  })

  it("builds the list plan under the shared list key and passes the query signal", async () => {
    const { calls, client } = fakeServer(() => Response.json(page))
    const params = { page: 2, pageSize: 2 }
    const plan = items.options(client, params)
    expect(plan.queryKey).toEqual(listQueryKey("items", params))
    const queryClient = createQueryClient()
    await expect(queryClient.fetchQuery(plan)).resolves.toEqual(page)
    expect(calls[0]?.init?.signal).toBeDefined()
  })
})
