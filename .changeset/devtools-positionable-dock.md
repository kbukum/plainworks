---
"@plainworks/devtools": minor
---

Users can now move and resize the devtools.

- **Pick a side** — the inspector header docks the devtools to the bottom, left, or right. The bar follows the edge, and the host's reserved space follows it too.
- **Resize the panel** — drag the edge facing your app, or focus it and use the arrow keys, Home, and End.
- **Remembered** — the layout persists in `localStorage` by default; pass `layoutSource` to keep it elsewhere.
- **Breaking:** `dock` is now `defaultDock` (`"bottom"` by default; `"auto"` is gone — every side falls back to the bottom below `48rem`). The host properties are now `--plainworks-devtools-inset-bottom`, `-left`, and `-right`.
