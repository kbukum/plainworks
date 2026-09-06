import { describe, expect, test, vi } from "vitest"
import { createSelector, defineStore } from "./facade"
import { createStore } from "./store"

interface CounterState {
  count: number
}
interface CounterActions {
  inc: () => void
  add: (n: number) => void
}

describe("defineStore", () => {
  test("composes state and actions into one initializer the store can run", () => {
    const store = createStore(
      defineStore<CounterState, CounterActions>({
        state: { count: 0 },
        actions: (set) => ({
          inc: () => set((s) => ({ count: s.count + 1 })),
          add: (n) => set((s) => ({ count: s.count + n })),
        }),
      }),
    )
    expect(store.getState().count).toBe(0)
    store.getState().inc()
    store.getState().add(4)
    expect(store.getState().count).toBe(5)
  })

  test("actions can read current state through get", () => {
    const store = createStore(
      defineStore<CounterState, { doubleInto: () => number }>({
        state: { count: 3 },
        actions: (_set, get) => ({ doubleInto: () => get().count * 2 }),
      }),
    )
    expect(store.getState().doubleInto()).toBe(6)
  })

  test("a state-only definition needs no actions", () => {
    const store = createStore(defineStore<CounterState>({ state: { count: 7 } }))
    expect(store.getState()).toEqual({ count: 7 })
  })

  test("a declared non-empty Actions type requires the actions factory", () => {
    // @ts-expect-error `actions` is required once `Actions` is non-empty, so a definition can never
    // claim in its type actions that are absent at runtime.
    const initializer = defineStore<CounterState, CounterActions>({ state: { count: 0 } })
    expect(typeof initializer).toBe("function")
  })

  test("an action key overriding a state key takes the action value (composed shape)", () => {
    // `value` is a number in state and a function in actions; the composed `StoreShape` models the
    // action override (`Omit<State, keyof Actions> & Actions`), so this type-checks as a function.
    const store = createStore(
      defineStore<{ value: number }, { value: () => string }>({
        state: { value: 0 },
        actions: () => ({ value: () => "action" }),
      }),
    )
    expect(typeof store.getState().value).toBe("function")
    expect(store.getState().value()).toBe("action")
  })
})

describe("createSelector", () => {
  interface Cart {
    items: readonly number[]
    tax: number
  }

  test("recomputes only when an input changes and returns a stable reference otherwise", () => {
    const combine = vi.fn((items: readonly number[]) => ({
      total: items.reduce((a, b) => a + b, 0),
    }))
    const totals = createSelector([(c: Cart) => c.items], combine)

    const items = [1, 2, 3]
    const state: Cart = { items, tax: 0.1 }
    const first = totals(state)
    expect(first).toEqual({ total: 6 })

    // Same input reference → memoized: no recompute, same object back (re-render-only-on-change).
    const again = totals({ items, tax: 0.2 })
    expect(again).toBe(first)
    expect(combine).toHaveBeenCalledTimes(1)

    // Changed input reference → recompute, new object.
    const next = totals({ items: [1, 2, 3, 4], tax: 0.1 })
    expect(next).not.toBe(first)
    expect(next).toEqual({ total: 10 })
    expect(combine).toHaveBeenCalledTimes(2)
  })

  test("combines multiple inputs and re-runs when any of them changes", () => {
    const combine = vi.fn(
      (items: readonly number[], tax: number) => items.reduce((a, b) => a + b, 0) * (1 + tax),
    )
    const grandTotal = createSelector([(c: Cart) => c.items, (c: Cart) => c.tax], combine)

    const items = [10]
    expect(grandTotal({ items, tax: 0 })).toBe(10)
    expect(grandTotal({ items, tax: 1 })).toBe(20)
    expect(combine).toHaveBeenCalledTimes(2)

    // Both inputs unchanged → cached.
    expect(grandTotal({ items, tax: 1 })).toBe(20)
    expect(combine).toHaveBeenCalledTimes(2)
  })

  test("Object.is drives change detection (NaN input is stable, 0 vs -0 is a change)", () => {
    const combine = vi.fn((n: number) => n)
    const pick = createSelector([(s: { n: number }) => s.n], combine)

    pick({ n: Number.NaN })
    pick({ n: Number.NaN })
    expect(combine).toHaveBeenCalledTimes(1)

    pick({ n: 0 })
    pick({ n: -0 })
    expect(combine).toHaveBeenCalledTimes(3)
  })

  test("propagates a throwing input selector without caching a result", () => {
    const boom = createSelector<{ n: number }, number, number>(
      [
        (s) => {
          if (s.n < 0) throw new Error("negative")
          return s.n
        },
      ],
      (n) => n,
    )
    expect(() => boom({ n: -1 })).toThrow("negative")
    expect(boom({ n: 2 })).toBe(2)
  })
})
