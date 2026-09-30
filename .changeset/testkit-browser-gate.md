---
"@plainworks/testkit": patch
---

Add a `./playwright` entry for browser gates. `createBrowserGate` can start one host per worker and sign in once, so suites run in parallel, and gives each test a fixed clock, locale, and time zone, reduced motion, and a watcher that fails on runtime errors, hydration errors, or off-origin requests. It ships axe, reflow, focus, and hydration checks as finding forms the flow engine consumes, plus `pressWithKeyboard` and `focusWithKeyboard` for reaching controls as a keyboard user does. `manualClock` now accepts an ISO start instant.
