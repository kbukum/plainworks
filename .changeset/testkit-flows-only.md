---
"@plainworks/testkit": minor
---

`@plainworks/testkit/browser` now has one model: flows. The per-surface screenshot gate is gone, with `planVisualTests`, `runVisualTest`, `VISUAL_TAG`, the `FULL_MATRIX`/`COMPACT_MATRIX`/`DIALOG_MATRIX` matrices, and the throwing `expect*` assertions. Express a surface as a one-checkpoint flow, and build any one-off assertion on the finding forms (`scanBrowserAxe`, `findFocusProblems`, `horizontalOverflow`, `waitForHydration`).

- No screenshot is compared with a committed baseline anymore: `browserGateScreenshot` is gone, and every check is structural.
- `assert` mode checks, and `capture` mode only writes frames and ARIA snapshots, one shot per frame.
- `extraDevices` runs a flow on devices beyond the preset's, such as `landscape` for a tall dialog or `reflow` at 320 px.
- The layout heuristics understand open overlays, their positioners, and backdrops; overlap is judged only between controls in the same fixed or sticky layer; and obscured focus models focus scrolling through every scroller, with `scroll-padding` and `scroll-margin`.
- Layout shift ignores scrolling, so a full-page capture no longer reads as a shift.
