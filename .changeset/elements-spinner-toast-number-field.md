---
"@plainworks/elements": minor
---

Loading, toasts, and number input now come from the atom set, and sonner is gone.

- **`Spinner` and `Toast` are vendored.** Both come from the shadcn CLI and are locked like every other atom. The sonner `Toaster` and the `sonner` dependency are removed.
- **`NumberField` is a new owned atom.** It wraps Base UI's number field with steppers, locale formatting, and `min`/`max`/`step`.
- **The README lists what we don't vendor, and why.** Check the "Not vendored" table before adding an atom.
