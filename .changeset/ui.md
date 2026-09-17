---
"@plainworks/ui": minor
---

Reshape `@plainworks/ui` into the plainworks-authored components that build on the atoms and the theme.

- The raw atoms now live in `@plainworks/elements`, and the design tokens now live in `@plainworks/theme`. `ui` builds on both.
- `ui` keeps the higher-level pieces: the theme provider, the theme toggle, and the error fallback.
- Breaking: the atom exports are removed — import atoms from `@plainworks/elements`. `@plainworks/ui/styles.css` stays the one stylesheet you import; it now composes the `@plainworks/theme` tokens and the `@plainworks/elements` styles.
