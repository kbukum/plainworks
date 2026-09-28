---
"@plainworks/ui": patch
---

Keyboard focus and anchor links now stop below the `AppShell`'s sticky header, so a focused control never lands hidden under it (WCAG 2.4.11). Apps no longer need their own `scroll-padding` rule.
