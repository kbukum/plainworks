# @plainworks/state

> Engine-neutral client-state seam with a built-in default store, SSR/RSC-safe by construction.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/state
```

## Server-safe core (`.`)

`createStore` is a **factory**, never a module-level singleton — every call returns an isolated store, so nothing leaks across SSR requests. The returned `Store` is a plainworks-owned type: the underlying engine (Zustand's vanilla core by default) never appears in the public contract, so it can change without a breaking change and your code stays decoupled from it. The store is usable outside React.

```ts
import { createStore } from "@plainworks/state"

const store = createStore<{ count: number; inc: () => void }>((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),
}))
```

### Ergonomics facade

`defineStore` composes an initializer from separate `state` and `actions`, and `createSelector` is a memoized derived selector — the combiner re-runs only when an input changes (compared with `Object.is`), so a derived object keeps a stable reference and re-renders a consumer only when it actually changes.

```ts
import { createSelector, defineStore } from "@plainworks/state"

const cart = defineStore<{ items: number[] }, { add: (n: number) => void }>({
  state: { items: [] },
  actions: (set) => ({ add: (n) => set((s) => ({ items: [...s.items, n] })) }),
})

const total = createSelector([(s: { items: number[] }) => s.items], (items) =>
  items.reduce((a, b) => a + b, 0),
)
```

### Bring your own store

The React binding drives React's own `useSyncExternalStore` over the owned `Store` seam, so any store — a hand-rolled one, or one you already run (MobX, valtio, …) — works as long as it implements `Store` (`getState`/`getInitialState`/`setState`/`subscribe`). Pass it to the Provider with `store={...}` (see below). For a raw `useSyncExternalStore` consumer, `toAdapter` bridges a `Store` into the `StateAdapter` (`subscribe`/`getSnapshot`/`getServerSnapshot`) shape for a selected slice.

## Client bindings (`./client`, `"use client"`)

`createStoreContext` returns a `Provider` plus selector hooks. The Provider builds the store once per mount (`useRef`), so two concurrent SSR requests each get an isolated store; `initialState` is the server → client hydration path.

In an RSC host (Next.js, TanStack Start), the module that calls the hooks needs the directive:

```tsx
"use client"

import { createStoreContext } from "@plainworks/state/client"

const { Provider, useStore } = createStoreContext<{ count: number; inc: () => void }>((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),
}))

function Counter() {
  const count = useStore((state) => state.count)
  const inc = useStore((state) => state.inc)
  return <button type="button" onClick={inc}>count: {count}</button>
}

// Hydrate from server-computed state:
// <Provider initialState={{ count: serverCount }}><Counter /></Provider>
```

`initialState` is shallow-merged over the initializer's state — right for plain-record state. For a non-record shape (array, class instance) or a deep merge, pass `mergeInitialState: (initial, serverState) => state` in the `createStoreContext` options so hydration preserves the shape.

To supply your own store engine, import from the engine-free `./client/supplied` subpath and pass a per-request `store`. This subpath loads **no** default engine — nothing pulls Zustand into your graph, even in a native-ESM host without tree-shaking:

```tsx
import { createSuppliedStoreContext } from "@plainworks/state/client/supplied"

const { Provider, useStore } = createSuppliedStoreContext<{ user: string }>()
// <Provider store={myStore}><Profile /></Provider>  — the `store` prop is required
```
