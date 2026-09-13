---
"@plainworks/state": patch
---

Add `@plainworks/state`, the client-state package with a Zustand-based default. It is safe for server rendering by design.

You create a store with a factory, one per request, so state never leaks between server-rendered requests, and there is no shared global. On the client, a provider gives each mount its own isolated store and hydrates cleanly from the server, so the first render matches. You can also bring your own store through a small adapter.
