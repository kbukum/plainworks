---
"@plainworks/auth": minor
"@plainworks/app": patch
"@plainworks/std": patch
---

Split `@plainworks/auth` into concern entries, and ship the BFF route helpers every host was writing by hand.

- **Smaller root entry.** `@plainworks/auth` exposes typed auth errors. Session and authorization concerns have focused entries; credential custody and signing stay on `./server`, outside client bundles.
- **BFF helpers on `@plainworks/auth/server`.** `createRequestJar` builds a cookie jar from a Web `Request`. `isSameOriginRequest` blocks cross-site form posts. `readFormBody` reads a form under a byte cap. `redirectToPath`/`redirectToUrl` answer with a `303` that carries the session cookies.
- `@plainworks/std/web` adds the structural `WebRequest` type these helpers read, and `@plainworks/app` imports its session type from the new subpath.
