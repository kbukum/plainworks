---
"@plainworks/mocks": minor
---

`createSeededRandom` and `RandomSource` are no longer re-exported. Import them from `@plainworks/std/random`. The Vite plugin reads request bodies through std's bounded reader, and an oversized body still gets a `413`. The package also uses std's numeric guards for its size and count options, which now require safe integers.
