---
"@plainworks/ui": patch
"@plainworks/elements": patch
---

Add components for comparing items:

- **`forms/combobox-field`**: a searchable picker over the vendored `combobox` atom, with groups, rich options, visible reasons on disabled options, and multi-select chips with named remove buttons. It is disabled while its form is pending.
- **`data/comparison-grid`**: items side by side with sticky headers that never hide focus, stacking into cards on narrow screens with the item headers still visible.
- **`clipboard/copy-button`**: a button that copies text and announces the result.

`@plainworks/elements` now vendors the shadcn `combobox` atom.
