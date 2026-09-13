---
"@plainworks/ui": minor
---

Reshape `@plainworks/ui` into the plainworks-authored components that build on the atoms and the theme.

- The raw atoms now live in `@plainworks/elements`, and the design tokens and stylesheet now live in `@plainworks/theme`. `ui` builds on both.
- `ui` keeps the higher-level pieces: the theme provider, the theme toggle, and the error fallback.
- Breaking: the atom exports and the `@plainworks/ui/styles.css` export are removed. Import atoms from `@plainworks/elements` and the stylesheet from `@plainworks/theme`.
