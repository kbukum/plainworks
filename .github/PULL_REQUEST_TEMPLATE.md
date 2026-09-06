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

- [ ] `bun run check-versions` — catalog / dedupe clean (Sherif + Syncpack)
- [ ] `bun run lint` — Biome clean
- [ ] `bun run typecheck` — no type errors
- [ ] `bun run check-boundaries` — dependency-cruiser layer gate green
- [ ] `bun run build` — tsdown builds all affected packages
- [ ] `bun run test` — Vitest green, coverage floors met (≥ 80% package / ≥ 85% security-critical)
- [ ] New behavior was written test-first (a test that fails without this change)

### Test Evidence

<!-- Optional: paste scoped output, e.g. `turbo run test --filter=@plainworks/<name>` -->

```
$ turbo run test --filter=@plainworks/<name>
...
```

## Host-independence & seams

<!-- plainworks is host-independent and server/client split. Confirm the invariants this PR must uphold. -->

- [ ] No import-time side effects; no module-level singletons (per-request/per-caller factories)
- [ ] Server-safe code stays in `.`; client-only code (`"use client"`) stays in `./client`
- [ ] Adapters/backends register explicitly (`register()` / `createX({...})`) — no `init()`-style magic
- [ ] No `any` in public APIs; errors are typed; tokens are header-only (never query string / localStorage)
- [ ] No upward imports — the layer map (`internal/boundaries` LAYERS) is respected

## Breaking Changes

<!-- If breaking, describe the impact and the migration path. Pre-1.0: breaking = a minor changeset. -->

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
