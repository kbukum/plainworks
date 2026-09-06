---
"@plainworks/std": patch
---

Expose `isSensitiveKey` from `@plainworks/std` — the single owner of the credential/secret key vocabulary (separator-insensitive substring matching), which `redact` now reuses internally. `redact` additionally masks the value half of any embedded `key=value` (or `key: value`) credential inside a larger string — a URL query, a thrown error message, a log line — so a token smuggled into free text is caught, not just one sitting as its own property value. Higher layers (e.g. header-only-auth URL guards) match this vocabulary through the shared predicate instead of forking their own list, so the rules never drift.
