---
"@plainworks/state": minor
---

Make `@plainworks/state` independent of its store engine. The store types are now owned by the package, so the default engine can change later without breaking anyone, and consumers are no longer tied to Zustand.

- The bring-your-own-store path is split into its own import, so a consumer who supplies their own store never loads the default engine.
- Add two small conveniences: a way to define a store from separate state and actions, and a memoized selector for derived values that keeps a stable reference and only re-renders when the value actually changes.
- Configuration mistakes now throw a clear, dedicated error.

The per-request factory and server-render isolation from the previous release are unchanged.
