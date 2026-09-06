import { describe, expect, test, vi } from "vitest"
import { toAdapter } from "./seam"
import { createStore } from "./store"

interface Counter {
  count: number
}

describe("toAdapter", () => {
  test("getSnapshot reflects the selected live state", () => {
    const store = createStore<Counter>(() => ({ count: 3 }))
    const adapter = toAdapter(store, (state) => state.count)
    expect(adapter.getSnapshot()).toBe(3)
    store.setState({ count: 4 })
    expect(adapter.getSnapshot()).toBe(4)
  })

  test("getServerSnapshot reads the initial state, not the mutated one", () => {
    const store = createStore<Counter>(() => ({ count: 3 }))
    const adapter = toAdapter(store, (state) => state.count)
    store.setState({ count: 10 })
    expect(adapter.getServerSnapshot()).toBe(3)
  })

  test("getSnapshot caches the selected snapshot until the state reference changes", () => {
    const store = createStore<Counter>(() => ({ count: 3 }))
    const selector = vi.fn((state: Counter) => ({ count: state.count }))
    const adapter = toAdapter(store, selector)

    // An allocating selector still returns a stable reference across reads — beyond the two
    // creation-time selections (client snapshot + server snapshot), no read re-runs the selector.
    const first = adapter.getSnapshot()
    expect(adapter.getSnapshot()).toBe(first)
    expect(selector).toHaveBeenCalledTimes(2)

    store.setState({ count: 4 })
    const next = adapter.getSnapshot()
    expect(next).not.toBe(first)
    expect(next).toEqual({ count: 4 })
    expect(adapter.getSnapshot()).toBe(next)
    expect(selector).toHaveBeenCalledTimes(3)
  })

  test("getSnapshot change detection follows Object.is for primitive states", () => {
    // 0 → -0 is a change (Zustand notifies), so the adapter must not serve the stale snapshot.
    const signed = createStore<number>(() => 0)
    const signedAdapter = toAdapter(signed, (state) => state)
    expect(signedAdapter.getSnapshot()).toBe(0)
    signed.setState(-0, true)
    expect(Object.is(signedAdapter.getSnapshot(), -0)).toBe(true)

    // NaN → NaN is stable, so reads stay cached and never re-run the selector.
    const nan = createStore<number>(() => Number.NaN)
    const nanSelector = vi.fn((state: number) => state)
    const nanAdapter = toAdapter(nan, nanSelector)
    expect(Number.isNaN(nanAdapter.getSnapshot())).toBe(true)
    expect(Number.isNaN(nanAdapter.getSnapshot())).toBe(true)
    expect(nanSelector).toHaveBeenCalledTimes(2) // creation-time client + server selections only
  })

  test("subscribe notifies on change and the returned unsubscribe detaches", () => {
    const store = createStore<Counter>(() => ({ count: 0 }))
    const adapter = toAdapter(store, (state) => state.count)
    const onStoreChange = vi.fn()

    const unsubscribe = adapter.subscribe(onStoreChange)
    store.setState({ count: 1 })
    expect(onStoreChange).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.setState({ count: 2 })
    expect(onStoreChange).toHaveBeenCalledTimes(1)
  })
})
