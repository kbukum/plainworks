---
"@plainworks/theme": minor
---

Each theme concern has its own subpath, and reduced motion can be chosen per user.

- **Import by concern.** `.` now exports only `cn` and `ThemeError`. Tokens and color schemes come from `@plainworks/theme/tokens`. Color-mode and motion preferences come from `@plainworks/theme/preference`.
- **A motion preference.** `MotionPreference` is `"system"` (follow the OS) or `"reduce"`. `useDocumentMotion` from `@plainworks/theme/client` sets `data-motion` on the document. `tokens.css` turns animations and transitions off under `data-motion="reduce"`, the same way it does for the OS setting.
