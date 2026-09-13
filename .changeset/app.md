---
"@plainworks/app": patch
---

Add `@plainworks/app`, the composition layer that wires the kit's packages into a working app through an injected set of capabilities. Nothing is baked in — an app is exactly the capabilities you pass it (a theme, a session, connection status, auth, telemetry, and so on).

- **A capability has two halves** — a server part and a client part, kept in separate modules so a server can run the server parts without pulling the client (React) code into its bundle. This keeps server-render and token safety structural, not a convention.
- **Per-request composition** — you build an app with a factory, one per request, with no shared global, so concurrent server renders stay isolated. Duplicate capabilities are rejected with a clear error.
- **No-flash server rendering** — the app resolves every capability's server part into plain, serializable data that crosses to the browser, so each capability's first client render matches the server. The server side never touches React, so it runs anywhere.
- **Client provider** — mounts the capabilities' client parts in the right order based on their declared dependencies, failing fast on an unknown or circular one. It doesn't hard-depend on the UI or query packages; a shared query client is just an opt-in capability.
- **Error boundary** — a behavioral boundary with an injectable fallback, a reporting hook, and automatic recovery.
- **Testing harness** — a shipped helper that renders a subtree inside the real providers, self-contained and starting no network mock.

Ready-made, ejectable recipes turn the state, auth, and query packages into capabilities, each on its own import so an app only loads what it uses. Each recipe is thin glue over a package's public API — remove `app` and wire the same pieces by hand, and you lose only the convenience. A boundary rule keeps this layer free of the UI package.
