import { describe, expect, it } from "vitest"
import {
  createEntityFactory,
  createFixtureSources,
  createReloadableFixtureSources,
  createStore,
} from "./index"

const clock = { now: () => 1_700_000_000_000 }

interface Widget {
  id: string
  name: string
}

describe("createEntityFactory", () => {
  let n = 0
  const factory = createEntityFactory<Widget>({
    create: (input) => ({ id: `w_${n++}`, name: input?.name ?? "widget" }),
    defaultSeedCount: 3,
  })

  it("creates one and many entities", () => {
    n = 0
    expect(factory.create({ name: "solo" })).toEqual({ id: "w_0", name: "solo" })
    expect(factory.createMany(2)).toHaveLength(2)
  })

  it("caches the seeded set and rebuilds when the requested count changes", () => {
    n = 0
    const seeded = factory.getSeeded()
    expect(seeded).toHaveLength(3)
    expect(factory.getSeeded()).toBe(seeded) // same reference — cached
    const larger = factory.getSeeded(5)
    expect(larger).not.toBe(seeded)
    expect(larger).toHaveLength(5)
  })

  it("clears the cache on reset", () => {
    n = 0
    const first = factory.getSeeded()
    factory.resetSeeded()
    expect(factory.getSeeded()).not.toBe(first)
  })
})

describe("createFixtureSources", () => {
  it("is reproducible for the same seed and domain", () => {
    const a = createFixtureSources(7, "users", clock)
    const b = createFixtureSources(7, "users", clock)
    expect(a.rng.next()).toBe(b.rng.next())
    expect(a.clock.now()).toBe(1_700_000_000_000)
  })

  it("derives an independent stream per domain", () => {
    const users = createFixtureSources(7, "users")
    const orders = createFixtureSources(7, "orders")
    expect(users.rng.next()).not.toBe(orders.rng.next())
  })

  it("issues deterministic per-domain ids, with and without a prefix", () => {
    const s = createFixtureSources(1, "users")
    expect([s.nextId("user"), s.nextId("user"), s.nextId()]).toEqual(["user_0", "user_1", "2"])
  })
})

describe("createReloadableFixtureSources", () => {
  it("delegates through and rewinds the stream and id counter on reload", () => {
    const s = createReloadableFixtureSources(3, "users", clock)
    const firstDraw = s.rng.next()
    const firstId = s.nextId("user")
    expect(s.clock.now()).toBe(1_700_000_000_000)

    s.reload()
    expect(s.rng.next()).toBe(firstDraw) // stream rewound
    expect(s.nextId("user")).toBe(firstId) // counter rewound
  })
})

describe("createStore", () => {
  const seed = (): Widget[] => [
    { id: "a", name: "alpha" },
    { id: "b", name: "beta" },
  ]

  it("initializes lazily from the initializer and finds by predicate", () => {
    const store = createStore(seed)
    expect(store.getAll()).toHaveLength(2)
    expect(store.find((w) => w.id === "b")?.name).toBe("beta")
    expect(store.findIndex((w) => w.id === "b")).toBe(1)
  })

  it("prepends, updates, and removes items", () => {
    const store = createStore(seed)
    store.prepend({ id: "z", name: "zeta" })
    expect(store.getAll()[0]?.id).toBe("z")
    store.update(0, { id: "z", name: "ZETA" })
    expect(store.getAll()[0]?.name).toBe("ZETA")
    store.remove(0)
    expect(store.find((w) => w.id === "z")).toBeUndefined()
  })

  it("ignores updates and removes at an out-of-range index", () => {
    const store = createStore(seed)
    store.update(99, { id: "x", name: "x" })
    store.remove(-1)
    expect(store.getAll()).toHaveLength(2)
  })

  it("setAll replaces the contents and reset re-seeds from the initializer", () => {
    const store = createStore(seed)
    store.setAll([{ id: "solo", name: "solo" }])
    expect(store.getAll()).toEqual([{ id: "solo", name: "solo" }])
    store.reset()
    expect(store.getAll()).toHaveLength(2)
  })
})
