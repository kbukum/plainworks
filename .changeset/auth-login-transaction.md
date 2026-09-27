---
"@plainworks/auth": patch
---

Let hosts recover when a sign-in can't finish.

- **`auth/login-transaction`**: `completeLogin` now throws this kind, not `auth/adapter`, when the login transaction cookie is missing, expired, or forged. This happens when sign-in started on another origin or the tab stayed open too long. A host can now show a "sign in again" path instead of a server error. A forged cookie is cleared first.
- **`isAuthErrorKind(error, kind)`**: checks an error's kind without `instanceof`. It keeps working when a bundler loads the package more than once, as Next.js does per server route.
