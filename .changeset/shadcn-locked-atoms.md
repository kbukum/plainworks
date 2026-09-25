---
"@plainworks/elements": minor
---

Atoms now ship exactly as the shadcn CLI produces them, pinned by a hash lock that `registry:validate` checks.

- Vendored atoms live in `src/shadcn/`; primitives we write ourselves (the theme-aware Toaster) live in `src/atoms/`. Import paths are unchanged.
- The hand-added `info`, `success`, and `warning` variants on `Alert` and `Badge` are gone. Use `Callout` from `@plainworks/ui/feedback` for toned messages.
- Atoms follow current upstream base-nova, including new `Button` sizes and Base UI's `Button` primitive.
