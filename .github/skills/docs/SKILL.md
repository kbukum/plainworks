---
name: docs
description: "plainworks: Update or audit documentation for accuracy, clear prose, working examples, and links."
user-invocable: true
---

# Documentation

Apply the [baseline](../../copilot-instructions.md). Scope to requested docs and directly affected references, including TSDoc and agent docs.

1. Verify scripts/filters against `package.json` and `turbo.json`; gates against `internal/verify`; package profiles, exports, and compiler restrictions against current tooling.
2. Never hand-edit generated layer tables. Use `bun run sync-layer-map` and its check. Preserve core/integration ownership, TS compiler boundary, and locked atoms/deviation ladder.
3. Lead with the reader's task or capability, then the shortest working example. Use concise active language and clear headings. Keep detail for correct use, contracts, safety, or verification; remove repetition and implementation narration. Changelogs summarize outcomes. Use tables or diagrams only when clearer than prose.
4. Markdown paragraphs are not hard-wrapped. TS comments wrap at 100 columns; preserve TSDoc tags/code/paragraphs and use comment-format tooling. Do not blindly join Markdown structure.
5. Remove stale usage guidance, not historical changelogs or accepted ADRs. Keep stable docs independent of temporary plans. Recreate stale app screenshots through `ui:capture --docs`, then open and judge them; never fabricate images.
6. Check links/anchors. Typecheck/build the affected package when TSDoc/examples change. Prose-only edits need no application build.

For agent docs, keep startup rules and descriptions short. Skills state actions and acceptance, linking canonical detail rather than repeating it. Preserve hard requirements and validate metadata/links.

Commit only when explicitly requested, using the commit skill.
