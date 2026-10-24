# Public API and consumer experience

Every export is a promise. This lens asks whether a newcomer could adopt the change and whether the surface can stay stable after alpha.

Rules: [Public API and stability](../../../engineering.md#public-api-and-stability), [Documentation and consumer experience](../../../engineering.md#documentation-and-consumer-experience). Model: [Choose an entry point](../../../../docs/architecture.md#choose-an-entry-point), [Distribution](../../../../docs/architecture.md#distribution).

**Changes:** every added, removed, or changed export, entry, error, and option. **Project:** each package's whole public surface, read as a first-time consumer would.

## Checks

| Finding | Severity |
|---|---|
| `any`, unchecked `as` or `!` in a public type | blocker |
| Breaking change with no `minor` Changeset, or with a shim, alias, or deprecated re-export left behind | blocker |
| Broken packaging: missing or wrong `exports` condition, CJS leftovers, types that do not resolve | blocker |
| Incidental export that leaks representation; a name importable from two paths | should-fix |
| Same concept named or shaped differently across packages | should-fix |
| Wire shape that follows one backend instead of a published standard | should-fix |
| Error that says what failed but not what the caller can do | should-fix |
| Public export without TSDoc, or TSDoc that disagrees with the signature; missing `@throws`, or `@example` on a primary entry | should-fix |
| Package that cannot be adopted alone, or a README that does not lead with import and runnable example | should-fix |
| Hidden global configuration instead of typed `createX({...})` options | should-fix |

There is no API report gate yet ([Known gaps](../../../engineering.md#known-gaps)), so diff the export list by hand: compare `src/index.ts`, `src/client.ts`, and subpath barrels with the base branch and confirm each change is intended and recorded in the Changeset.

## Detection starters

```bash
git diff origin/main... -- 'packages/*/src/index.ts' 'packages/*/src/client.ts' 'packages/*/tsdown.config.ts'
rg ": any\b|as any|<any>" packages/*/src --glob '!*.test.*'
rg -n "^export (async )?(function|const|class|interface|type)" packages/*/src --glob '!*.test.*'
bun run check-packaging
```
