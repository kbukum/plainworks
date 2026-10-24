# Quality

Debt and drift that compile cleanly but should not land. This maps to the alpha, redesign-first stance, not to style preference; Biome owns formatting.

Rules: [Development stage](../../../engineering.md#development-stage), [Code structure](../../../engineering.md#code-structure), [Documentation and consumer experience](../../../engineering.md#documentation-and-consumer-experience) (comments).

**Changes:** the diff against simpler alternatives, plus defects in its blast radius. **Project:** dead code, leftover compatibility paths, and outdated patterns.

## Checks

| Finding | Severity |
|---|---|
| Compatibility shim, alias, deprecated re-export, or compat flag | blocker |
| Parallel old and new model for one concern, or new code built beside a superseded path | blocker |
| Superseded path left with no consumer migration and deletion in the same change | blocker |
| Dead export, speculative generality, leftover scaffolding, or commented-out code | should-fix |
| Over-abstraction (a seam with one implementation and no real second) or indirection that hurts readability | should-fix |
| A real subsystem creeping into `std` instead of its own one-word package | should-fix |
| Comment that restates the code or narrates history (`was`, `now`, `changed to`) | should-fix |
| `TODO`, `FIXME`, or `HACK` without a tracked issue link | should-fix |
| `bun run lint` or `bun run check-comments` not clean | should-fix |

A good comment gives a non-obvious reason: a spec constraint, a security invariant, a deliberate trade-off, or a workaround with its cause. A small arrow sketch beats a paragraph for state machines and event order.

For a real defect, propose the end state: move every consumer (packages, apps, `internal`, `create-plainworks` templates, docs, skills) and delete the old path.

## Detection starters

```bash
rg -ni "@deprecated|legacy|compat|backward|shim|old[A-Z]" packages/*/src apps internal
rg -n "^\s*//\s*(export|const|function|class|if|return)\b" packages/*/src
rg -n "^\s*//\s*(changed|was |now |previously|used to)" packages/*/src
rg -n "TODO|FIXME|HACK" packages/*/src
```
