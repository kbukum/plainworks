---
"@plainworks/state": minor
---

`@plainworks/state/client` is now DOM-free, so the same React bindings run in the browser and on React Native.

- **Browser scopes moved to adapter subpaths** named after what they use: `@plainworks/state/web-storage` (`persistentScope`, `sessionScope`), `@plainworks/state/cookie` (`cookieScope`), and `@plainworks/state/url` (`urlScope`). `./client/scope` is gone.
- **One React entry.** `createSuppliedStoreContext` moved from `./client/supplied` into `./client`.
- **`Sensitivity` has one home.** Import it from `@plainworks/state`, not `./client`.
