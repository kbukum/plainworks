---
"@plainworks/devtools": minor
---

Rail entries take their accessible name from their visible label and value, so they meet WCAG 2.5.3 Label in Name (axe-core 4.14 now checks this). The `railEntry` and `staleRailEntry` label functions are replaced by a `railStale` note. At narrow rail widths the label is kept for screen readers instead of being removed.
