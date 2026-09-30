import { expect, test } from "vitest"
import { fakeCacheInvalidator } from "./cache"

function seeded() {
  const cache = fakeCacheInvalidator()
  cache.seed(["users"])
  cache.seed(["users", { id: 1 }])
  cache.seed(["posts"])
  return cache
}

test("a key is a prefix by default", async () => {
  const cache = seeded()
  await cache.invalidate({ key: ["users"] })
  expect(cache.isStale(["users"])).toBe(true)
  expect(cache.isStale(["users", { id: 1 }])).toBe(true)
  expect(cache.isStale(["posts"])).toBe(false)
})

test("an object part matches every entry holding the fields it names", async () => {
  const cache = fakeCacheInvalidator()
  cache.seed(["users", { id: 1, role: "admin" }])
  cache.seed(["users", { id: 2, role: "admin" }])
  await cache.invalidate({ key: ["users", { id: 1 }] })
  expect(cache.isStale(["users", { id: 1, role: "admin" }])).toBe(true)
  expect(cache.isStale(["users", { id: 2, role: "admin" }])).toBe(false)
})

test("exact matches only the key itself, comparing parts structurally", async () => {
  const cache = seeded()
  await cache.invalidate({ key: ["users", { id: 1 }], exact: true })
  expect(cache.isStale(["users", { id: 1 }])).toBe(true)
  expect(cache.isStale(["users"])).toBe(false)
})

test("no key invalidates everything and targets are recorded", async () => {
  const cache = seeded()
  await cache.invalidate()
  expect(cache.isStale(["posts"])).toBe(true)
  expect(cache.targets).toEqual([{}])
})

test("seeding again makes an entry fresh, and an unknown key is never stale", async () => {
  const cache = seeded()
  await cache.invalidate({ key: ["posts"] })
  cache.seed(["posts"])
  expect(cache.isStale(["posts"])).toBe(false)
  expect(cache.isStale(["missing"])).toBe(false)
})
