---
"@plainworks/app": minor
---

Redesign app bootstrap so every host composes the same way: `createApp` plus the capability recipes.

- **One hydration owner.** `./hydration` writes the server's snapshot and query cache as one escaped JSON block with `renderHydrationScript`, and `readHydration` validates it in the browser. The block is data, not script, so a strict CSP needs no nonce. `serializeSnapshot` and `deserializeSnapshot` are gone.
- **No-flash theme without an inline script.** A capability can add classes to `<html>`; `app.htmlClass(snapshot)` returns them and rejects any token that isn't safe in an HTML attribute. `./capabilities/theme` resolves the theme cookie on the server and mounts `ThemeProvider` on the client. It also offers the motion preference through `createMotionCapability` and `useMotion`.
- **Server-resolved sign-in.** `./capabilities/auth` now pairs `createAuthResolver`, which reads the session from the request cookie, with `createAuthCapability`, which seeds your `createSessionContext` provider. The page renders signed in or out from the first paint. The old store-backed recipe is gone.
- **HTTP recipe.** `./capabilities/http` provides a caller-owned HTTP client through `createHttpCapability`.
