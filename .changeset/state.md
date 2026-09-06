---
"@plainworks/state": patch
---

Add `@plainworks/state` (L1), the client-state seam with a Zustand default adapter, SSR/RSC-safe by construction. The server-safe `.` entry ships `createStore` — a per-request store **factory** (never a module-level singleton, so state never leaks across SSR requests), usable outside React — plus the `useSyncExternalStore`-shaped `StateAdapter` seam for bring-your-own stores and a `toAdapter` bridge, and the typed `StateError`. The `./client` entry ships `createStoreContext`: a `useRef`-scoped `Provider` (isolated store per mount, `initialState` as the server→client hydration path baked into the store's initial state so SSR output and first client render agree, shallow-merged by default with an injectable `mergeInitialState` for non-record shapes) and selector hooks (`useStore`/`useStoreApi`) delegating to Zustand (reference-compared snapshots).
