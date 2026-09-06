import { expect, test } from "vitest"
import {
  createBoundedQueue,
  type OverflowPolicy,
  QueueClosedError,
  QueueFullError,
  QueueWaitersFullError,
} from "./bounded-queue"
import { AbortError } from "./timeout"

test("drop-oldest evicts the head to admit a newer item", () => {
  const queue = createBoundedQueue<number>(2, { overflow: "drop-oldest" })
  expect(queue.push(1)).toBe(true)
  queue.push(2)
  expect(queue.push(3)).toBe(true)
  expect(queue.size).toBe(2)
  expect(queue.tryPop()).toBe(2)
  expect(queue.tryPop()).toBe(3)
})

test("drop-new rejects a newcomer when full", () => {
  const queue = createBoundedQueue<number>(1, { overflow: "drop-new" })
  expect(queue.push(1)).toBe(true)
  expect(queue.push(2)).toBe(false)
  expect(queue.size).toBe(1)
})

test("reject throws QueueFullError at capacity", () => {
  const queue = createBoundedQueue<number>(1, { overflow: "reject" })
  queue.push(1)
  expect(() => queue.push(2)).toThrow(QueueFullError)
})

test("a waiting consumer receives a pushed item directly", async () => {
  const queue = createBoundedQueue<string>(1)
  const pending = queue.pop()
  queue.push("hello")
  await expect(pending).resolves.toBe("hello")
  expect(queue.size).toBe(0)
})

test("closing rejects waiters and refuses further pushes", async () => {
  const queue = createBoundedQueue<number>(1)
  const pending = queue.pop()
  queue.close()
  await expect(pending).rejects.toBeInstanceOf(QueueClosedError)
  expect(() => queue.push(1)).toThrow(QueueClosedError)
  await expect(queue.pop()).rejects.toBeInstanceOf(QueueClosedError)
})

test("tryPop returns undefined when empty", () => {
  expect(createBoundedQueue<number>(1).tryPop()).toBeUndefined()
})

test("rejects an invalid capacity", () => {
  expect(() => createBoundedQueue<number>(0)).toThrow(RangeError)
  expect(() => createBoundedQueue<number>(1, { maxWaiters: 0 })).toThrow(RangeError)
  expect(() => createBoundedQueue<number>(1, { overflow: "bogus" as OverflowPolicy })).toThrow(
    RangeError,
  )
})

test("pending consumers are bounded; the excess is rejected with a distinct waiter-limit error", async () => {
  const queue = createBoundedQueue<number>(1)
  const first = queue.pop()
  await expect(queue.pop()).rejects.toBeInstanceOf(QueueWaitersFullError)
  queue.push(1)
  await expect(first).resolves.toBe(1)
})

test("maxWaiters overrides the default pending-consumer bound", async () => {
  const queue = createBoundedQueue<number>(1, { maxWaiters: 2 })
  const a = queue.pop()
  const b = queue.pop()
  await expect(queue.pop()).rejects.toBeInstanceOf(QueueWaitersFullError)
  queue.push(1)
  queue.push(2)
  await expect(a).resolves.toBe(1)
  await expect(b).resolves.toBe(2)
})

test("stays FIFO across many pops with a head index rather than O(n) shifts", () => {
  const queue = createBoundedQueue<number>(1_000)
  for (let i = 0; i < 1_000; i++) {
    queue.push(i)
  }
  for (let i = 0; i < 1_000; i++) {
    expect(queue.tryPop()).toBe(i)
  }
  expect(queue.size).toBe(0)
  expect(queue.tryPop()).toBeUndefined()
})

test("an aborted pop is removed from the waiters and rejects with AbortError", async () => {
  const queue = createBoundedQueue<number>(1)
  const controller = new AbortController()
  const pending = queue.pop({ signal: controller.signal })
  controller.abort()
  await expect(pending).rejects.toBeInstanceOf(AbortError)
  // The aborted waiter no longer consumes pushes, and its slot is freed for another consumer.
  queue.push(1)
  expect(queue.size).toBe(1)
  await expect(queue.pop()).resolves.toBe(1)
})

test("an already-aborted signal rejects immediately without taking a waiter slot", async () => {
  const queue = createBoundedQueue<number>(1)
  const controller = new AbortController()
  controller.abort()
  await expect(queue.pop({ signal: controller.signal })).rejects.toBeInstanceOf(AbortError)
  const waiting = queue.pop()
  queue.push(1)
  await expect(waiting).resolves.toBe(1)
})
