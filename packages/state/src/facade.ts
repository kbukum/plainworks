import type { Store, StoreInitializer, StoreSet } from "./store"

/**
 * The runtime store shape composed from a {@link StoreDefinition}: state fields with the action set
 * merged on top. `defineStore` spreads `state` then `actions`, so on a key present in both the
 * action value wins at runtime — `Omit<State, keyof Actions> & Actions` models exactly that, instead
 * of an unsound `State & Actions` intersection that would claim a key holds both shapes at once.
 */
export type StoreShape<State extends object, Actions extends object> = Omit<State, keyof Actions> &
  Actions

/**
 * Declarative store shape for {@link defineStore} when it carries actions: the initial `state` as a
 * plain object plus the `actions` factory. Splitting the two keeps state readable and actions typed,
 * and pairs with {@link createSelector} for derived values — the explicit, no-magic ergonomics facade
 * over the `(set, get, store) => state` initializer. For a state-only store, omit `actions` entirely
 * (the state-only {@link defineStore} overload) rather than passing an empty factory.
 */
export interface StoreDefinition<State extends object, Actions extends object> {
  /** The initial state fields. */
  readonly state: State
  /** Actions closing over `set`/`get` (and the store), merged onto the state. */
  readonly actions: (
    set: StoreSet<StoreShape<State, Actions>>,
    get: () => StoreShape<State, Actions>,
    store: Store<StoreShape<State, Actions>>,
  ) => Actions
}

/**
 * Build a {@link StoreInitializer} from separate `state` and `actions`. The result is a plain
 * initializer — pass it to `createStore` or `createStoreContext` exactly like a hand-written one.
 *
 * ```ts
 * const counter = defineStore({
 *   state: { count: 0 },
 *   actions: (set) => ({ inc: () => set((s) => ({ count: s.count + 1 })) }),
 * })
 * ```
 *
 * Actions are required exactly when the store has them: the state-only overload rejects an `actions`
 * key, and the with-actions overload requires the factory — so a definition can never claim actions
 * in its type that are absent at runtime.
 */
export function defineStore<State extends object>(definition: {
  readonly state: State
}): StoreInitializer<State>
export function defineStore<State extends object, Actions extends object>(
  definition: StoreDefinition<State, Actions>,
): StoreInitializer<StoreShape<State, Actions>>
export function defineStore<State extends object, Actions extends object>(definition: {
  readonly state: State
  readonly actions?: (
    set: StoreSet<StoreShape<State, Actions>>,
    get: () => StoreShape<State, Actions>,
    store: Store<StoreShape<State, Actions>>,
  ) => Actions
}): StoreInitializer<StoreShape<State, Actions>> {
  return (set, get, store) => {
    const actions = definition.actions?.(set, get, store) ?? ({} as Actions)
    // The initializer's declared return is the composed shape; the runtime object carries exactly the
    // state fields with the (possibly empty) action set merged on top, so this is the one place the
    // composition is asserted from its two verified halves.
    return { ...definition.state, ...actions } as StoreShape<State, Actions>
  }
}

/** One input selector for {@link createSelector}: derives an input value from the state. */
type Input<State, Value> = (state: State) => Value

/**
 * A memoized derived selector, reselect-style: given input selectors and a `combine`, the combiner
 * re-runs only when an input changes (compared with `Object.is`), so a derived object keeps a stable
 * reference across reads and a consuming `useStore` re-renders only when the derived value actually
 * changes. Pure and server-safe — the memo depends solely on the inputs, so it is SSR-safe to share.
 *
 * ```ts
 * const total = createSelector([(s: Cart) => s.items], (items) => items.reduce(sum, 0))
 * ```
 */
export function createSelector<State, A, Result>(
  inputs: readonly [Input<State, A>],
  combine: (a: A) => Result,
): (state: State) => Result
export function createSelector<State, A, B, Result>(
  inputs: readonly [Input<State, A>, Input<State, B>],
  combine: (a: A, b: B) => Result,
): (state: State) => Result
export function createSelector<State, A, B, C, Result>(
  inputs: readonly [Input<State, A>, Input<State, B>, Input<State, C>],
  combine: (a: A, b: B, c: C) => Result,
): (state: State) => Result
export function createSelector<State, A, B, C, D, Result>(
  inputs: readonly [Input<State, A>, Input<State, B>, Input<State, C>, Input<State, D>],
  combine: (a: A, b: B, c: C, d: D) => Result,
): (state: State) => Result
export function createSelector<State, Result>(
  inputs: readonly Input<State, unknown>[],
  combine: (...values: unknown[]) => Result,
): (state: State) => Result {
  let last: { readonly args: readonly unknown[]; readonly result: Result } | null = null
  return (state) => {
    const args = inputs.map((input) => input(state))
    const previous = last
    if (
      previous !== null &&
      args.length === previous.args.length &&
      args.every((arg, index) => Object.is(arg, previous.args[index]))
    ) {
      return previous.result
    }
    const result = combine(...args)
    last = { args, result }
    return result
  }
}
