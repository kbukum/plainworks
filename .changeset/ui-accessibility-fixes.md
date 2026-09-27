---
"@plainworks/ui": patch
---

Give the data table's selection checkboxes a 24 px safe zone, so "Select all" no longer touches the first column's sort button (WCAG 2.5.8). A form that fails validation now moves focus to its first invalid field, so a keyboard user never loses focus when the submit button disables itself. `Modal` and `Drawer` keep their header and footer in view and scroll only the body. A scrolling body with no focusable control becomes a keyboard-focusable region named by the title, so keyboard users can scroll it too.
