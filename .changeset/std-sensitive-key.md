---
"@plainworks/std": patch
---

Make `@plainworks/std` the single source of truth for what counts as a secret key name. Redaction now reuses that list, and it also masks secrets embedded inside larger strings — such as a token slipped into a URL, an error message, or a log line — not just values sitting in their own field.

Higher layers reuse the same check instead of keeping their own copies, so the rules never drift apart.
