---
"@plainworks/std": minor
---

Add the two edges every host-independent transport needs: portable web types and a shared validation seam. Both have no dependencies and are safe on the server.

- **Portable web types** — self-contained types for the web platform (fetch, headers, response, URL, and friends) so a package can describe these in its public API and ship types that check on their own, without forcing consumers to install browser or Node type packages.
- **Validation seam** — one shared way to validate untrusted data at a trust boundary, compatible with Zod, Valibot, and ArkType, plus a single clearly-marked escape hatch for when validation is intentionally skipped.

**Breaking (pre-1.0):** the resilience helpers now describe their cancellation signal with the portable web type instead of the built-in one. A native signal you pass in still works; a signal a callback receives may need to be forwarded or adapted at the boundary.
