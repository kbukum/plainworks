# @plainworks/state

> Client-state seam with a Zustand default adapter, SSR/RSC-safe by construction.

Part of the [plainworks](../../README.md) kit.

## Install

```sh
bun add @plainworks/state
```

## Server-safe core (`.`)

`createStore` is a **factory**, never a module-level singleton — every call returns an isolated store, so nothing leaks across SSR requests. The store is Zustand-backed and usable outside React.

```ts
import { createStore } from "@plainworks/state"

const store = createStore<{ count: number; inc: () => void }>((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),
}))
```

Bringing your own store instead of the default? Implement the `StateAdapter` seam (a `useSyncExternalStore`-shaped `subscribe`/`getSnapshot`/`getServerSnapshot`); `toAdapter` bridges the default store into it.

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
