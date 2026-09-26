---
"@plainworks/devtools": minor
---

The devtools shell is now a docked, non-modal workspace with a self-contained stylesheet.

- **Beside your app, not over it** — a docked bar (diagnostics rail plus **Inspect**) and a side or bottom inspector. By default it adds to `<html>`'s padding so it never covers content or a focused control, and it publishes `--plainworks-devtools-inset-*` for full-height layouts (`reserveSpace={false}`).
- **Non-modal** — the page stays usable while the inspector is open: no backdrop, blur, or inert. Escape and the close button hand focus back.
- **No host Tailwind needed** — `@plainworks/devtools/styles.css` ships as plain CSS, scoped to the inspector, so it can't restyle your page. Your dark, theme, and density classes still apply. Custom renderers keep your own styles.
- **Stable with large data** — long labels and values wrap within the panel, the tab strip scrolls instead of squeezing, and only the content area scrolls.
- **Breaking:** `presentation` is removed; the bar always shows the rail and the Inspect button. `dock` now defaults to `"auto"`. Destructive commands confirm inline, and the instance and timeline filters use native selects.
