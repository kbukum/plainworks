---
"@plainworks/theme": minor
"@plainworks/ui": minor
"@plainworks/elements": patch
"@plainworks/devtools": patch
---

Give the theme a complete, accessible design foundation.

- **New tokens.** Status tones (`info`, `success`, `warning`, `destructive`), a type scale, density spaces, elevation, focus, motion, and stacking layers. Each one is a `--pw-*` custom property with a Tailwind utility, such as `bg-success`, `text-heading`, `h-control`, `shadow-overlay`, and `z-toast`.
- **Accessible by default.** Every text pairing meets WCAG 2.2 AA in light and dark mode for all nine color schemes. Input borders and the focus ring meet 3:1. The emerald, orange, and cyan accents are darker so their button text stays readable.
- **Safe base rules.** A bare `border` now uses the border token instead of the text color. Every focused element gets a visible outline. `prefers-contrast: more` strengthens borders and secondary text, and reduced motion sets every duration to zero.
- **Plain CSS entry.** `@plainworks/theme/tokens.css` works in any host without a Tailwind build.
- **Class merging.** `cn` knows the new utilities, so `cn("text-heading text-primary")` keeps both classes.

Breaking: `colorRoleVar` and `semanticRoleVar` are replaced by `themeVar(token)`. The unprefixed `--radius` property is now `--pw-radius`. `@plainworks/ui` re-exports the new names.
