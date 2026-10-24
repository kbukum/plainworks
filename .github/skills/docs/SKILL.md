---
name: docs
description: "plainworks: Update or audit documentation for accuracy, clear prose, working examples, and links."
user-invocable: true
---

# Documentation

The rules are in [Documentation and consumer experience](../../engineering.md#documentation-and-consumer-experience). Scope to the requested docs and the references they affect, including TSDoc, Changesets, and agent docs. Each topic has one owner (see the [engineering standard](../../engineering.md#where-guidance-lives)); link to it instead of restating it.

## Steps

1. **Check facts against the source.** Scripts and filters against `package.json` and `turbo.json`, gates against `bun run verify --list`, entries and profiles against `tsdown.config.ts` and current tooling. Never copy a gate count or list.
2. **Read as a newcomer.** Can someone adopt this package alone from the page? It leads with the concern, the import, and a runnable example. Errors and options say what the caller can do. Contributor mechanics (layers, profiles, gates) stay out of consumer docs.
3. **Simplify.** Plain active sentences, short sections, tables or examples for dense detail, a diagram where a flow is hard to follow in prose. Cut repetition, history, and implementation narration.
4. **Keep generated content generated.** Use `bun run sync-layer-map` for layer-map blocks and `ui:capture --docs` for app screenshots, then open and judge the images. Never fabricate images.
5. **Respect format.** Markdown paragraphs are one source line. TS comments wrap at 100 columns through `bun run format-comments`; keep TSDoc tags, code, and paragraphs intact.
6. **Keep the record.** Remove stale guidance, never past changelog entries or accepted ADRs. Stable docs never depend on temporary plans.
7. **Verify.** Check every link and anchor. Typecheck or build the package when TSDoc or examples change; prose-only edits need no app build.

**Agent docs.** Instructions state rules, skills state actions and acceptance, and both link the canonical section. Keep startup rules and descriptions short and preserve hard requirements.

Commit only when asked, using the [commit](../commit/SKILL.md) skill.
