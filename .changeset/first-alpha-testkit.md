---
"@plainworks/testkit": minor
---

First alpha of the shared test kit: deterministic harnesses and seam fakes, accessibility helpers, and a Playwright browser gate that runs flows and judges captures. The gate gives each test a data scope; its scope header is optional, so a suite that isolates its own data can share one host across workers. Text-size capture variants reuse the host's CSP nonce. Animation settling rechecks live transitions so removed native controls cannot stall captures. A touch pick from a list that is already open taps the option directly, so the list cannot reopen after the pick. A keyboard journey reaches a control inside a roving-focus group, such as a toolbar or toggle group, from the group's Tab stop with the arrow keys. A sticky bar that has scrolled away with its container no longer counts as pinned chrome, so focus reveals its controls.
