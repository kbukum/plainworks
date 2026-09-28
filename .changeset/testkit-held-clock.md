---
"@plainworks/testkit": patch
---

Visual surfaces can now set `holdsClock` to be captured on a paused page clock, so content driven by a live timer stays still in the baseline. The axe scan runs after the capture, once the clock resumes.
