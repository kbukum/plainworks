---
"@plainworks/auth": minor
---

CSRF protection is a session-bound synchronizer token, and the API now says so. `CsrfProtection.verify(binding, token)` checks the echoed token against the server session. The unused double-submit cookie argument is gone. The token length bound (256 characters) moves into the CSRF owner, and `issue` refuses to mint a longer token. `byteLength` is limited to 16–64. The unused `@plainworks/auth/csrf` subpath is removed; the server session remains the way to issue and check tokens.
