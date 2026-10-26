---
"@plainworks/testkit": minor
---

First alpha of the shared test kit: deterministic harnesses and seam fakes, accessibility helpers, and a Playwright browser gate that runs flows and judges captures. The gate gives each test a data scope; its scope header is optional, so a suite that isolates its own data can share one host across workers.
