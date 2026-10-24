## Description

<!-- A clear, concise description of what this PR changes. -->

## Motivation

<!-- Why is this change needed? What problem does it solve? Link related issues: Fixes #123 / Closes #456 -->

## Type of Change

<!-- Mark the relevant option(s) with an 'x' -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior)
- [ ] Documentation update
- [ ] Refactoring (no functional change)
- [ ] Performance improvement
- [ ] Test coverage improvement

## Package(s) Affected

<!-- List the packages this PR changes, e.g. @plainworks/std, @plainworks/auth. Use "new" for a new package. -->

-

## Changes Made

<!-- Key changes as bullets. Keep it high-level — the diff shows the detail. -->

-

## Testing

<!-- Confirm the Definition of Done gates pass locally, scoped to what changed. -->

- [ ] `bun run verify` green, scoped to what changed (`--filter='...[origin/main]'`); full `bun run verify` before ready-for-review
- [ ] Coverage floors met (≥ 80% package / ≥ 85% security-critical)
- [ ] Nothing under `packages/elements/src/shadcn/` edited by hand
- [ ] New behavior was written test-first (a test that fails without this change)

### Test Evidence

<!-- Optional: paste scoped output, e.g. `bun run verify --filter=@plainworks/<name>` -->

```
$ bun run verify --filter=@plainworks/<name>
...
```

## Engineering invariants

<!-- See .github/engineering.md. Tick what this PR upholds; explain anything unticked. -->

- [ ] Imports point strictly downward; core contains no technology integration (not even an optional peer)
- [ ] No import-time I/O, globals, or service locators; the host owns resource lifetimes
- [ ] Neutral code stays in `.`; React bindings in `./client` with per-module `"use client"`
- [ ] Public API is small and typed: named exports with TSDoc, typed errors with causes, no `any`
- [ ] Browser sessions stay opaque `__Host-` cookies; no tokens in the browser or in URLs
- [ ] Superseded code is deleted with every consumer moved; no shim, alias, or parallel old/new model
- [ ] App-visible UI changes: flows pass and captures were opened and judged (WCAG 2.2 AA, responsive)

## Breaking Changes

<!-- Alpha: breaking changes are welcome. Say what was redesigned and what old path was removed. No migration shims or deprecations. Pre-1.0: breaking = a minor changeset. -->

## Changeset

- [ ] A changeset is included (`bun run changeset`) with the correct bump, **or** this PR changes nothing publishable (tooling/docs/CI only)

## Checklist

- [ ] Public API items have TSDoc; exported enums/unions are documented where they may grow
- [ ] New dependencies (if any) are justified, catalog-pinned, license-checked, and advisory-free
- [ ] `bun.lock` updated and committed if dependencies changed
- [ ] GitHub Actions (if touched) are pinned by commit SHA
- [ ] Docs/README updated if behavior or the public surface changed

## Additional Notes

<!-- Any extra context, screenshots, or information for reviewers. -->
