---
"@plainworks/std": patch
"@plainworks/state": patch
"@plainworks/theme": patch
"@plainworks/testkit": patch
---

Scoped state and the theme provider now share one reconciliation core: `createSourceReconciler` in `@plainworks/std`. It is a latest-wins, removal-aware loop that handles out-of-order reads, a local write racing a read, and an external clear.

- **Theme** resets to its configured initial value when its source is cleared externally, and an in-flight read can no longer overwrite a fresher local write. It throws a typed `ThemeError`.
- **`std`** adds `parseCookieHeader`, the read half of its cookie grammar.
- **`testkit`**'s `deferredStateSource` accepts `echoesLocalWrites` to model a backend that does not echo the local writer.
