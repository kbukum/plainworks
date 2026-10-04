---
"@plainworks/auth": minor
"@plainworks/std": minor
"@plainworks/http": minor
"@plainworks/connect": minor
"@plainworks/channel": minor
"@plainworks/app": minor
"create-plainworks": minor
---

Replace signed identity cookies and browser token refresh with injected opaque server sessions and a generation-fenced browser lifecycle. Share protected cancellation and bounded status admission across HTTP, RPC, channels and React composition; migrate both reference hosts and the standalone Next starter to header-only logout CSRF and explicit revocation outcomes. Provider `refresh` and `logout` take an explicit session-handle request, never return credentials after the session family is revoked, and read provider responses under a byte cap.

The browser session has one owner. The composition root creates the `AuthStore`, calls `useSessionOwner(runtime)`, and `close()` cancels its work without ending it, so React StrictMode replays cleanly. `SessionProvider` and `createAuthCapability` now require and borrow that runtime; they no longer seed or build one. `createAuth`, the navigator's hidden-form `submit`, and `AuthStore.dispose()` are removed.

Spend a cached logout CSRF proof once, and replace it once with the current session's proof when the server rejects it after another tab rotated the cookie.
