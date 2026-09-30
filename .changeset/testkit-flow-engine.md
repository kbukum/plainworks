---
"@plainworks/testkit": patch
---

Add a flow engine to `@plainworks/testkit/playwright`. Define a journey once with `defineFlow`, and run it as an end-to-end test or capture it for review. Each flow replays once per device and checks every page variant at each checkpoint: mode, brand theme, density, and accessibility preferences. Layout heuristics catch clipped text, overlapping targets, content under fixed chrome, broken images, and layout shift. Every step is time-bounded and cancellable. Failures come with an inert evidence bundle, and each run writes a versioned `report.json` and `report.md`.
