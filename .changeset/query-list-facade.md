---
"@plainworks/query": patch
---

Make `@plainworks/query` the one place to import list types and helpers together. Its list types now come from `@plainworks/std`, and it re-exports the full list contract so a consumer imports the types from the same package that provides the list query helpers. The URL builder still comes from `@plainworks/http`, and `@plainworks/query` no longer depends on `@plainworks/http`.
