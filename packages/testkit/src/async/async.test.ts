import { expect, test } from "vitest"
import { deferred, flushMicrotasks } from "./async"

test("deferred resolves from the outside", async () => {
  const d = deferred<number>()
  let settled: number | undefined
  const pending = d.promise.then((value) => {
    settled = value
  })
  expect(settled).toBeUndefined()
  d.resolve(7)
  await pending
  expect(settled).toBe(7)
})

test("deferred rejects from the outside", async () => {
  const d = deferred<number>()
  const boom = new Error("failed")
  d.reject(boom)
  await expect(d.promise).rejects.toBe(boom)
})

test("flushMicrotasks lets a resolved promise settle before asserting", async () => {
  let ran = false
  Promise.resolve().then(() => {
    ran = true
  })
  expect(ran).toBe(false)
  await flushMicrotasks()
  expect(ran).toBe(true)
})

test("flushMicrotasks drains recursively queued microtask chains", async () => {
  let depth = 0
  const chain = (): void => {
    depth += 1
    if (depth < 5) void Promise.resolve().then(chain)
  }
  void Promise.resolve().then(chain)
  await flushMicrotasks()
  expect(depth).toBe(5)
})

test("flushMicrotasks rejects non-safe-integer turn bounds", async () => {
  await expect(flushMicrotasks(Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError)
  await expect(flushMicrotasks(-1)).rejects.toThrow(RangeError)
  await expect(flushMicrotasks(1.5)).rejects.toThrow(RangeError)
})
