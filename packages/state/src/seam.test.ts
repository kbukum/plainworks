import { describe, expect, test, vi } from "vitest"
import { toExternalStore } from "./seam"
import { createStore } from "./store"

interface Counter {
  count: number
}

describe("toExternalStore", () => {
  test("getSnapshot reflects the selected live state", () => {
    const store = createStore<Counter>(() => ({ count: 3 }))
    const external = toExternalStore(store, (state) => state.count)
    expect(external.getSnapshot()).toBe(3)
    store.setState({ count: 4 })
    expect(external.getSnapshot()).toBe(4)
  })

  test("getServerSnapshot reads the initial state, not the mutated one", () => {
    const store = createStore<Counter>(() => ({ count: 3 }))
    const external = toExternalStore(store, (state) => state.count)
    store.setState({ count: 10 })
    expect(external.getServerSnapshot()).toBe(3)
  })

  test("getSnapshot caches the selected snapshot until the state reference changes", () => {
    const store = createStore<Counter>(() => ({ count: 3 }))
    const selector = vi.fn((state: Counter) => ({ count: state.count }))
    const external = toExternalStore(store, selector)

    // An allocating selector still returns a stable reference across reads — beyond the two
    // creation-time selections (client snapshot + server snapshot), no read re-runs the selector.
    const first = external.getSnapshot()
    expect(external.getSnapshot()).toBe(first)
    expect(selector).toHaveBeenCalledTimes(2)

    store.setState({ count: 4 })
    const next = external.getSnapshot()
    expect(next).not.toBe(first)
    expect(next).toEqual({ count: 4 })
    expect(external.getSnapshot()).toBe(next)
    expect(selector).toHaveBeenCalledTimes(3)
  })

  test("getSnapshot change detection follows Object.is for primitive states", () => {
    // 0 → -0 is a change (Zustand notifies), so the external must not serve the stale snapshot.
    const signed = createStore<number>(() => 0)
    const signedStore = toExternalStore(signed, (state) => state)
    expect(signedStore.getSnapshot()).toBe(0)
    signed.setState(-0, true)
    expect(Object.is(signedStore.getSnapshot(), -0)).toBe(true)

    // NaN → NaN is stable, so reads stay cached and never re-run the selector.
    const nan = createStore<number>(() => Number.NaN)
    const nanSelector = vi.fn((state: number) => state)
    const nanStore = toExternalStore(nan, nanSelector)
    expect(Number.isNaN(nanStore.getSnapshot())).toBe(true)
    expect(Number.isNaN(nanStore.getSnapshot())).toBe(true)
    expect(nanSelector).toHaveBeenCalledTimes(2) // creation-time client + server selections only
  })

  test("subscribe notifies on change and the returned unsubscribe detaches", () => {
    const store = createStore<Counter>(() => ({ count: 0 }))
    const external = toExternalStore(store, (state) => state.count)
    const onStoreChange = vi.fn()

    const unsubscribe = external.subscribe(onStoreChange)
    store.setState({ count: 1 })
    expect(onStoreChange).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.setState({ count: 2 })
    expect(onStoreChange).toHaveBeenCalledTimes(1)
  })
})
