---
"@plainworks/std": patch
"@plainworks/http": patch
"@plainworks/mocks": patch
"@plainworks/state": patch
"@plainworks/testkit": patch
---

Harden how packages are published. Every package now carries complete npm metadata and passes a new packaging check that validates each built package for modern consumers. The check runs in CI and is built into the package generator, so future packages inherit both the metadata and the check.

Releases also gain provenance (a verifiable link back to the source that built them). No runtime behavior change.
