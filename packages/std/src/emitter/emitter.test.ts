import { describe, expect, test, vi } from "vitest"
import { createEmitter } from "./emitter"

describe("createEmitter", () => {
  test("delivers each value to every listener in subscription order", () => {
    const emitter = createEmitter<number>()
    const seen: string[] = []
    emitter.subscribe((value) => seen.push(`a${value}`))
    emitter.subscribe((value) => seen.push(`b${value}`))

    emitter.emit(1)

    expect(seen).toEqual(["a1", "b1"])
  })

  test("treats the same callback subscribed twice as two subscriptions", () => {
    const emitter = createEmitter<void>()
    const listener = vi.fn()
    const first = emitter.subscribe(listener)
    emitter.subscribe(listener)

    emitter.emit()
    first.unsubscribe()
    emitter.emit()

    expect(listener).toHaveBeenCalledTimes(3)
    expect(emitter.listenerCount).toBe(1)
  })

  test("unsubscribe is idempotent", () => {
    const emitter = createEmitter<void>()
    const kept = emitter.subscribe(() => {})
    const dropped = emitter.subscribe(() => {})

    dropped.unsubscribe()
    dropped.unsubscribe()

    expect(emitter.listenerCount).toBe(1)
    kept.unsubscribe()
    expect(emitter.listenerCount).toBe(0)
  })

  test("a listener that unsubscribes during a pass does not skip the others", () => {
    const emitter = createEmitter<void>()
    const seen: string[] = []
    const first = emitter.subscribe(() => {
      seen.push("first")
      first.unsubscribe()
    })
    emitter.subscribe(() => seen.push("second"))

    emitter.emit()
    emitter.emit()

    expect(seen).toEqual(["first", "second", "second"])
  })

  test("a listener added during a pass waits for the next value", () => {
    const emitter = createEmitter<number>()
    const late = vi.fn()
    emitter.subscribe(() => {
      emitter.subscribe(late)
    })

    emitter.emit(1)
    expect(late).not.toHaveBeenCalled()
    emitter.emit(2)
    expect(late).toHaveBeenCalledWith(2)
  })

  test("routes a throwing listener to onListenerError and keeps delivering", () => {
    const onListenerError = vi.fn()
    const emitter = createEmitter<number>({ onListenerError })
    const failure = new Error("listener broke")
    const after = vi.fn()
    emitter.subscribe(() => {
      throw failure
    })
    emitter.subscribe(after)

    expect(() => emitter.emit(1)).not.toThrow()
    expect(onListenerError).toHaveBeenCalledWith(failure)
    expect(after).toHaveBeenCalledWith(1)
  })

  test("without onListenerError, rethrows after every listener ran", () => {
    const emitter = createEmitter<void>()
    const failure = new Error("listener broke")
    const after = vi.fn()
    emitter.subscribe(() => {
      throw failure
    })
    emitter.subscribe(after)

    expect(() => emitter.emit()).toThrow(failure)
    expect(after).toHaveBeenCalledOnce()
  })

  test("without onListenerError, several failures surface together", () => {
    const emitter = createEmitter<void>()
    emitter.subscribe(() => {
      throw new Error("one")
    })
    emitter.subscribe(() => {
      throw new Error("two")
    })

    let thrown: unknown
    try {
      emitter.emit()
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).errors.map((error: Error) => error.message)).toEqual([
      "one",
      "two",
    ])
  })

  test("clear detaches every listener", () => {
    const emitter = createEmitter<void>()
    const listener = vi.fn()
    const subscription = emitter.subscribe(listener)

    emitter.clear()
    emitter.emit()
    subscription.unsubscribe()

    expect(listener).not.toHaveBeenCalled()
    expect(emitter.listenerCount).toBe(0)
  })
})
