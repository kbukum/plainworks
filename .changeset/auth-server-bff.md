---
"@plainworks/auth": minor
"@plainworks/app": patch
"@plainworks/std": patch
---

Split `@plainworks/auth` into concern entries, and ship the BFF route helpers every host was writing by hand.

- **Smaller root entry.** `@plainworks/auth` now holds only `createAuth` and `AuthError`. Each other concern has its own subpath (`./session`, `./csrf`, `./redirect`, `./signer`, and so on), and token custody stays on `./server`, so a client bundle never pulls it in.
- **BFF helpers on `@plainworks/auth/server`.** `createRequestJar` builds a cookie jar from a Web `Request`. `isSameOriginRequest` blocks cross-site form posts. `readFormBody` reads a form under a byte cap. `redirectToPath`/`redirectToUrl` answer with a `303` that carries the session cookies, and `resolveSigningKey` rejects a short key rather than silently replacing it.
- `@plainworks/std/web` adds the structural `WebRequest` type these helpers read, and `@plainworks/app` imports its session type from the new subpath.
