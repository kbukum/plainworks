import { expect, test } from "vitest"
import { createEmitter, recordEvents } from "./events"

test("emit delivers values to every subscriber in order", () => {
  const emitter = createEmitter<number>()
  const a = recordEvents<number>()
  const b = recordEvents<number>()
  emitter.subscribe(a.listener)
  emitter.subscribe(b.listener)

  emitter.emit(1)
  emitter.emit(2)

  expect(a.events).toEqual([1, 2])
  expect(b.events).toEqual([1, 2])
})

test("unsubscribe detaches the listener and is idempotent", () => {
  const emitter = createEmitter<string>()
  const rec = recordEvents<string>()
  const sub = emitter.subscribe(rec.listener)

  emitter.emit("a")
  sub.unsubscribe()
  sub.unsubscribe()
  emitter.emit("b")

  expect(rec.events).toEqual(["a"])
  expect(emitter.listenerCount).toBe(0)
})

test("listenerCount reflects active subscriptions", () => {
  const emitter = createEmitter<number>()
  expect(emitter.listenerCount).toBe(0)
  const s1 = emitter.subscribe(() => {})
  emitter.subscribe(() => {})
  expect(emitter.listenerCount).toBe(2)
  s1.unsubscribe()
  expect(emitter.listenerCount).toBe(1)
})

test("a listener unsubscribing mid-dispatch does not disturb the current pass", () => {
  const emitter = createEmitter<number>()
  const rec = recordEvents<number>()
  const self = emitter.subscribe((value) => {
    if (value === 1) self.unsubscribe()
  })
  emitter.subscribe(rec.listener)

  emitter.emit(1)
  emitter.emit(2)

  expect(rec.events).toEqual([1, 2])
  expect(emitter.listenerCount).toBe(1)
})

test("the same listener subscribed twice counts and unsubscribes independently", () => {
  const emitter = createEmitter<number>()
  const rec = recordEvents<number>()
  const first = emitter.subscribe(rec.listener)
  const second = emitter.subscribe(rec.listener)

  expect(emitter.listenerCount).toBe(2)
  emitter.emit(1)
  expect(rec.events).toEqual([1, 1])

  first.unsubscribe()
  expect(emitter.listenerCount).toBe(1)
  emitter.emit(2)
  expect(rec.events).toEqual([1, 1, 2])

  second.unsubscribe()
  expect(emitter.listenerCount).toBe(0)
})

test("recorder.clear drops captured values", () => {
  const rec = recordEvents<number>()
  rec.listener(1)
  rec.clear()
  rec.listener(2)
  expect(rec.events).toEqual([2])
})
