---
"@plainworks/std": patch
"@plainworks/http": patch
"@plainworks/state": patch
---

Document, per package, which platform features it relies on and which runtimes it targets. Each README now states its platform dependencies — used directly when they're the same everywhere, or injected with a default when they vary by host — and whether it runs on the server, in the browser, or on React Native.

No behavior change. The package generator gains the same section so future packages inherit it, and the boundary checks now make sure a package that claims to be host-independent can't quietly reintroduce a browser or Node dependency.
