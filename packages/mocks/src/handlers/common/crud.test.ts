import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createStore } from "../../data/common"
import { createLatency } from "../../latency"
import { type CrudHandlerConfig, createCrudHandlers } from "./crud"
import type { InputSpec } from "./decode"

interface Widget {
  id: string
  name: string
  category: string
  size: number
  active: boolean
  createdAt: string
  updatedAt: string
}

const clock = { now: () => 1_700_000_000_000 }
const inputSpec: InputSpec<Partial<Widget>> = {
  name: { kind: "string" },
  category: { kind: "enum", values: ["a", "b", "c"] },
  size: { kind: "number" },
  active: { kind: "boolean" },
}

const seed = (): Widget[] =>
  ["a", "b", "a", "c", "b"].map((category, i) => ({
    id: `w_${i}`,
    name: `widget-${i}`,
    category,
    size: i,
    active: i % 2 === 0,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  }))

const widgetStore = createStore(seed)
const gadgetStore = createStore(() => [
  { ...seed()[0], id: "g_0", name: "gadget", size: 10 } as Widget,
])

let nextId = 100
function createWidget(input?: Partial<Widget>): Widget {
  return {
    id: `w_${nextId++}`,
    name: input?.name ?? "new",
    category: input?.category ?? "a",
    size: input?.size ?? 0,
    active: input?.active ?? true,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
  }
}

const baseConfig: Omit<CrudHandlerConfig<Widget, Partial<Widget>>, "basePath" | "store"> = {
  entityName: "widget",
  createEntity: createWidget,
  latency: createLatency(0),
  clock,
  inputSpec,
  searchFields: ["name"],
  filterFields: ["category", "size"],
  facetFields: ["category"],
}

const server = setupServer(
  ...createCrudHandlers<Widget>({
    ...baseConfig,
    basePath: "/api/widgets",
    store: widgetStore,
    sortComparators: {
      category: (a, b) => {
        const rank: Record<string, number> = { c: 3, b: 2, a: 1 }
        return (rank[String(a)] ?? 0) - (rank[String(b)] ?? 0)
      },
    },
  }),
  ...createCrudHandlers<Widget>({
    ...baseConfig,
    basePath: "/api/gadgets",
    entityName: "gadget",
    store: gadgetStore,
    // Recompute a derived field so the applyUpdate override branch is exercised.
    applyUpdate: (current, updates) => ({ ...current, ...updates, size: 999 }),
  }),
)

const url = (path: string): string => `http://mock.test${path}`
async function get(path: string): Promise<Response> {
  return fetch(url(path))
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
beforeEach(() => {
  nextId = 100
  widgetStore.setAll(seed())
  gadgetStore.setAll([{ ...seed()[0], id: "g_0", name: "gadget", size: 10 } as Widget])
})
afterAll(() => server.close())

describe("GET list", () => {
  it("paginates with a default page and honors the pageSize/limit aliases", async () => {
    const res = await get("/api/widgets")
    const body = (await res.json()) as { data: Widget[]; pagination: { total: number } }
    expect(res.status).toBe(200)
    expect(body.pagination.total).toBe(5)
    const limited = await (await get("/api/widgets?limit=2")).json()
    expect((limited as { data: Widget[] }).data).toHaveLength(2)
  })

  it("filters by text search", async () => {
    const body = (await (await get("/api/widgets?search=widget-3")).json()) as { data: Widget[] }
    expect(body.data.map((w) => w.id)).toEqual(["w_3"])
  })

  it("filters by a PostgREST operator, a legacy plain value, and a comma `in` list", async () => {
    const op = (await (await get("/api/widgets?category=eq.a")).json()) as { data: Widget[] }
    expect(op.data.every((w) => w.category === "a")).toBe(true)
    const plain = (await (await get("/api/widgets?category=b")).json()) as { data: Widget[] }
    expect(plain.data.every((w) => w.category === "b")).toBe(true)
    const list = (await (await get("/api/widgets?category=a,b")).json()) as { data: Widget[] }
    expect(list.data.every((w) => w.category === "a" || w.category === "b")).toBe(true)
  })

  it("computes requested facets and rejects an unknown facet field", async () => {
    const ok = (await (await get("/api/widgets?facets=category")).json()) as {
      facets: Record<string, Record<string, number>>
    }
    expect(ok.facets.category).toMatchObject({ a: 2, b: 2, c: 1 })
    expect((await get("/api/widgets?facets=bogus")).status).toBe(400)
  })

  it("sorts by an allowed field and rejects an unknown field or order", async () => {
    const desc = (await (await get("/api/widgets?sortBy=size&order=desc")).json()) as {
      data: Widget[]
    }
    expect(desc.data.map((w) => w.size)).toEqual([4, 3, 2, 1, 0])
    expect((await get("/api/widgets?sortBy=nope")).status).toBe(400)
    expect((await get("/api/widgets?sortBy=size&order=sideways")).status).toBe(400)
  })

  it("sorts using a custom comparator when configured", async () => {
    const desc = (await (await get("/api/widgets?sortBy=category&order=desc")).json()) as {
      data: Widget[]
    }
    // Custom comparator ranks c (3) > b (2) > a (1)
    expect(desc.data.map((w) => w.category)).toEqual(["c", "b", "b", "a", "a"])
  })

  it("rejects invalid pagination and mutually exclusive page+cursor", async () => {
    expect((await get("/api/widgets?page=0")).status).toBe(400)
    expect((await get("/api/widgets?pageSize=abc")).status).toBe(400)
    expect((await get("/api/widgets?page=1&cursor=")).status).toBe(400)
  })
})

describe("GET list (cursor mode)", () => {
  it("walks forward and backward with id-anchored tokens", async () => {
    const first = (await (await get("/api/widgets?cursor=&pageSize=2")).json()) as {
      data: Widget[]
      pagination: { nextCursor: string | null; prevCursor: string | null }
    }
    expect(first.data.map((w) => w.id)).toEqual(["w_0", "w_1"])
    expect(first.pagination.prevCursor).toBeNull()
    expect(first.pagination.nextCursor).toBe("n_w_1")

    const next = (await (
      await get(`/api/widgets?cursor=${first.pagination.nextCursor}&pageSize=2`)
    ).json()) as { data: Widget[]; pagination: { prevCursor: string | null } }
    expect(next.data.map((w) => w.id)).toEqual(["w_2", "w_3"])
    expect(next.pagination.prevCursor).toBe("p_w_2")

    const prev = (await (
      await get(`/api/widgets?cursor=${next.pagination.prevCursor}&pageSize=2`)
    ).json()) as { data: Widget[] }
    expect(prev.data.map((w) => w.id)).toEqual(["w_0", "w_1"])
  })

  it("rejects a foreign token and a vanished anchor", async () => {
    expect((await get("/api/widgets?cursor=xyz")).status).toBe(400)
    expect((await get("/api/widgets?cursor=n_missing")).status).toBe(400)
  })
})

describe("GET by id", () => {
  it("returns the item or 404", async () => {
    expect((await get("/api/widgets/w_1")).status).toBe(200)
    expect((await get("/api/widgets/nope")).status).toBe(404)
  })
})

describe("POST create", () => {
  it("creates a valid entity and rejects an invalid body", async () => {
    const res = await fetch(url("/api/widgets"), {
      method: "POST",
      body: JSON.stringify({ name: "fresh", category: "b" }),
    })
    expect(res.status).toBe(201)
    const created = (await res.json()) as { data: Widget }
    expect(created.data.name).toBe("fresh")

    const bad = await fetch(url("/api/widgets"), {
      method: "POST",
      body: JSON.stringify({ name: 123 }),
    })
    expect(bad.status).toBe(400)
  })
})

describe("PATCH update", () => {
  async function patch(path: string, body: unknown): Promise<Response> {
    return fetch(url(path), { method: "PATCH", body: JSON.stringify(body) })
  }

  it("merges updates, ignores immutable id/createdAt, and sets updatedAt", async () => {
    const res = await patch("/api/widgets/w_1", {
      name: "renamed",
      id: "hacked",
      createdAt: "1999-01-01T00:00:00.000Z",
    })
    const body = (await res.json()) as { data: Widget }
    expect(body.data.name).toBe("renamed")
    expect(body.data.id).toBe("w_1")
    expect(body.data.createdAt).toBe("2020-01-01T00:00:00.000Z")
    expect(body.data.updatedAt).toBe(new Date(clock.now()).toISOString())
  })

  it("uses a custom applyUpdate to recompute derived fields", async () => {
    const res = await patch("/api/gadgets/g_0", { name: "patched" })
    const body = (await res.json()) as { data: Widget }
    expect(body.data.name).toBe("patched")
    expect(body.data.size).toBe(999)
  })

  it("404s an unknown id", async () => {
    expect((await patch("/api/widgets/nope", { name: "x" })).status).toBe(404)
  })

  it("rejects an invalid update body", async () => {
    expect((await patch("/api/widgets/w_1", { size: "big" })).status).toBe(400)
  })
})

describe("DELETE", () => {
  it("removes an item and 404s an unknown id", async () => {
    expect((await fetch(url("/api/widgets/w_0"), { method: "DELETE" })).status).toBe(200)
    expect((await fetch(url("/api/widgets/nope"), { method: "DELETE" })).status).toBe(404)
  })
})
