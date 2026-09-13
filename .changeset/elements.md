---
"@plainworks/elements": patch
---

Add `@plainworks/elements`, the package that owns the shadcn/Base UI atoms (button, input, dialog, and the rest).

- Atoms are installed and updated through the shadcn CLI, not copied by hand. A small, repeatable transform adapts each one to plainworks and formats it, so every atom lands ready to use.
- The registry file, the package exports, and the build entries are all generated from the atoms on disk, so they can never fall out of sync with the actual set.
- Each atom is imported from its own path for good tree-shaking, and each interactive one is checked for accessibility.
