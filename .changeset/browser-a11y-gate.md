---
"@plainworks/theme": patch
"@plainworks/elements": patch
---

Fix two accessibility defects a new browser axe gate surfaced:

- The theme substrate now paints the document body from its background/foreground tokens, so a resolved dark surface no longer leaves light-on-dark text over a browser-white body.
- Breadcrumb links now meet the 24×24 CSS-px minimum target size (WCAG 2.2 AA).
