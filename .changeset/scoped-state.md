---
"@plainworks/std": patch
"@plainworks/state": patch
"@plainworks/testkit": patch
---

Add **scoped state**: one consumer API that reads and writes a value the same way no matter where it actually lives — in memory, local or session storage, a cookie, the URL, or a future remote backend. You move a value by changing a single `scope` setting, never by rewriting the call sites.

- `@plainworks/std` gains the seam that describes *where a value lives*, independent of React.
- `@plainworks/state` composes that with its store: a memory scope on the server-safe entry, DOM-free hooks, and host-backed scopes (storage, cookie, URL) on a separate browser-only import. Each host backend is injectable with a sensible default.
- The consumer API is a callable hook, like Zustand — define it once, then read, write, or grab an imperative handle. You can also compose one object whose fields each live in a different place, and a guard rejects putting a secret anywhere but memory.
- `@plainworks/testkit` adds in-memory fakes so scoped state can be tested without a browser, including the async/remote shape.
