---
"@plainworks/mocks": patch
---

Make the `@plainworks/mocks` list handler understand the full list-query format that `@plainworks/http` produces, so a request built by the frontend round-trips through the mock backend. The mock now reuses the operator tokens from `@plainworks/http` instead of keeping a second copy, so the builder and parser can never drift.

- Resolves the full operator vocabulary, including multi-part operators.
- Decodes escaped values so they round-trip exactly, and treats parentheses as data in plain values.
- Supports cursor-based paging with stable, id-anchored cursors, so inserting or reordering rows between requests never shifts the next page.
- Computes only the facets that were requested, and rejects unknown ones.
