---
"@plainworks/state": patch
---

Give persisted state a schema-evolution story. A `versioning` policy (`{ version, migrate }`) on a scoped value or object field stamps the current version on every write and, on read, upgrades an older payload forward instead of silently discarding it when the shape changes.

- **Migrate, don't drop** — a value stored at an older version runs through your `migrate` to the current shape; state persisted before versioning existed is treated as version 0, so the same path upgrades unversioned data.
- **Never fabricate** — a value stamped with a newer, unknown version, or a migration that throws, becomes a typed `StateSourceError` at the read boundary, consistent with the existing schema-validation guard.
- **Opt-in and thin** — values without a policy are stored exactly as before; this is cache-routing versioning, not a sync or offline engine.
