---
"@plainworks/std": minor
"@plainworks/testkit": minor
"@plainworks/auth": minor
"@plainworks/query": patch
---

std now owns the primitives that tests and adapters used to copy. `manualClock` moves from testkit to `@plainworks/std/time`, beside `fixedClock`, so lower layers can use it. `isStructurallyEqual` joins the std prelude. `matchesCacheTarget` in `@plainworks/std/seam` is the one rule for which cache entries a `CacheTarget` hits, and `isSameCacheKey` the one rule for key identity; like a serialized key, both treat an object field set to `undefined` as absent, and a partial target never matches an array against a record or a shorter array. `isStructurallyEqual` compares records by field names as well as values. query's `createCacheInvalidator` and testkit's `fakeCacheInvalidator` both use it. `@plainworks/auth/testing` drops `steppedClock`; use `manualClock` from std.
