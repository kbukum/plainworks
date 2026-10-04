# Pass 04 — Quality: simplicity, maintainability, current patterns

Catch debt and drift that compiles cleanly but should not land. None of this is style nitpicking — it maps to plainworks' pre-stable, redesign-first stance.

Use the [review skill](../SKILL.md) for scope, execution, and finding format. This checklist does not require a separate agent.

**Scope note.** *Changes mode:* judge the diff against simpler alternatives and check the packaging/style gates on touched public items. *Project mode:* hunt for dead code, lingering compatibility shims, and outdated patterns across the package(s).

## Checks

- **Root-cause over patches (alpha, no compatibility).** No backward compatibility is owed; breaking changes are welcome. Each of these is a **blocker**:
  - a compatibility shim, alias, deprecated re-export, or compat flag
  - a back-compat wrapper "to avoid breaking callers" (there are none to protect)
  - a parallel old-and-new model for one concern
  - new code shaped around, on top of, or next to a superseded path
  - a superseded path left in place with no named deletion step

  Suggest the end-state redesign: migrate every consumer (packages, apps, internal, `create-plainworks` templates, docs, skills) and delete the old path. Prefer a clean redesign on current best practices over a symptom patch. Pre-existing defects, legacy, and design smells in the blast radius (touched files and their close callers/callees) are in scope and should be cleaned up.
- **No patched or re-extended atoms.** A vendored atom (`packages/elements/src/shadcn/`) edited in place to fix a bug, restyle, or re-add a tone/size/state variant upstream doesn't ship is a **blocker** — it breaks the lock and every future `registry:update`. Move the change down the **deviation ladder**: theme tokens/rules → call site → a `@plainworks/ui` wrapper. An upstream bug is fixed at the lowest rung and noted for upstream reporting.
- **Dead / useless code.** No-caller exports, speculative generality (one impl, no near-term second), commented-out blocks, leftover scaffolding. Remove. Commented-out code is a should-fix — git history exists.
- **Simplicity.** The simplest design that fully solves it. Over-abstraction (an adapter seam with a single impl and no real second, a generic where a concrete type reads better) is as much a finding as under-design. Indirection that hurts DX is a finding — flag it.
- **ESM / packaging discipline.** `"type": "module"`, generated `sideEffects`, generated `exports` (`.` and, where present, `./client`), generated `files`, and `typecheck` separate from `build`. A CJS interop hack, a wrong/missing `exports` condition, a committed `dist/`, a `dist`-less publishable package, or hand-edited shape-derived manifest fields is a should-fix.
- **Catalog discipline.** Every dependency and peer range uses `catalog:` (or `workspace:*` for internal packages). An inline version string in a `package.json` is a should-fix (Syncpack/Sherif also fail CI on it).
- **`std` charter.** `@plainworks/std` stays zero-dependency, host-independent primitives only. A real concern (a whole subsystem) creeping into `std` instead of graduating to its own one-word package is a should-fix — that is exactly how a `std` rots into a `utils`.
- **Naming.** One concern, one plain word, the same word everywhere. A banned name (`core`, `engine`, `foundation`, `utils`), a stuttering export, or a generic file name that hides its concern (a `types.ts` that owns a protocol) is a should-fix.
- **Style gates.** Biome clean (`bun run lint`); imports organized. Biome is authoritative for format — don't hand-format against it.

## Detection starters

Flag candidates, not verdicts.

```bash
rg -n "^\s*//\s*(export|const|function|class|if|return)" packages/*/src   # commented-out code
rg -n "\"(react|zustand|@tanstack)[^\"]*\":\s*\"[^c]" packages/*/package.json  # inline version, not catalog:
rg -n "TODO|FIXME|HACK" packages/*/src                                    # each needs a tracked issue link
rg -ni "@deprecated|legacy|compat|backward|shim|\bv2\b|old[A-Z]" packages/*/src apps internal  # compatibility scaffolding: redesign and delete
grep -l '"main"\|"require"' packages/*/package.json                       # CJS leftovers in an ESM-only kit
git diff --name-only origin/main... -- packages/elements/src/shadcn packages/elements/shadcn.lock.json  # vendored atoms touched: must come from registry:update
```

Then `bun run lint` for the style gate and `bun run check-versions` for the catalog gate.
