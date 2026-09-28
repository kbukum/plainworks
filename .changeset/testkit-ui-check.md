---
"@plainworks/testkit": minor
---

Add `ui:check` to `@plainworks/testkit/browser`: one command that runs an app's flows, checks every checkpoint, and shows what your change did to the UI. Save a `before` snapshot, or compare with a git ref captured once from a worktree and cached. Each changed frame appears as before, after, and a highlighted diff, with an ARIA diff and contact sheets. `--affected` runs only the flows whose `covers` match your changed files, and falls back to every flow when a file isn't covered. A warm host keeps checks fast, and a generated Playwright MCP config lets you explore the same signed-in, fixed-clock app. The overlap and obscured-focus heuristics now judge what is painted and what focus scrolls clear, so content under a docked bar with matching `scroll-padding` no longer fails. `setupFlowRun` replaces `finishFlowRun`.
