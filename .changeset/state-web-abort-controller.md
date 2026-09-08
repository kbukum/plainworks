---
"@plainworks/state": patch
---

Keep the scoped-state reconciler DOM-free: the cancellation controller in `createSourceReconciler` is typed as the universal `WebAbortController` shim instead of the DOM-lib global, so the `./client` entry compiles on React Native/Expo (and any DOM-less runtime) without a `lib: ["DOM"]` leak.
