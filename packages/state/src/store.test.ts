import { describe, expect, test, vi } from "vitest"
import { createStore } from "./store"

interface Counter {
  count: number
  inc: () => void
}

const counter = (): ReturnType<typeof createStore<Counter>> =>
  createStore<Counter>((set) => ({
    count: 0,
    inc: () => set((state) => ({ count: state.count + 1 })),
  }))

describe("createStore", () => {
  test("exposes initial state and runs actions defined in the initializer", () => {
    const store = counter()
    expect(store.getState().count).toBe(0)
    store.getState().inc()
    expect(store.getState().count).toBe(1)
  })

  test("setState merges a partial update", () => {
    const store = counter()
    store.setState({ count: 5 })
    expect(store.getState().count).toBe(5)
  })

  test("setState replaces the whole state with a computed function (replace: true)", () => {
    const store = counter()
    store.setState({ count: 3 })
    // The `replace: true` overload accepts a function, so a computed full replacement needs no cast.
    store.setState((state) => ({ count: state.count * 2, inc: state.inc }), true)
    expect(store.getState().count).toBe(6)
    expect(typeof store.getState().inc).toBe("function")
  })

  test("getInitialState keeps the creation-time state after updates (server snapshot)", () => {
    const store = counter()
    store.setState({ count: 9 })
    expect(store.getInitialState().count).toBe(0)
    expect(store.getState().count).toBe(9)
  })

  test("subscribe fires with next and previous state, and unsubscribe stops it", () => {
    const store = counter()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.getState().inc()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ count: 1 }),
      expect.objectContaining({ count: 0 }),
    )

    unsubscribe()
    store.getState().inc()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  test("each factory call yields an isolated store (no shared singleton)", () => {
    const a = counter()
    const b = counter()
    a.setState({ count: 42 })
    expect(a.getState().count).toBe(42)
    expect(b.getState().count).toBe(0)
  })
})
