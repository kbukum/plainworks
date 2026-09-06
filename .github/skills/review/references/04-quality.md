# Pass 04 — Quality: simplicity, maintainability, current patterns

Catch debt and drift that compiles cleanly but should not land. None of this is style nitpicking — it maps to plainworks' pre-stable, redesign-first stance.

> **Run in a separate, clean-context agent** with a high-capability model. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation.

**Scope note.** *Changes mode:* judge the diff against simpler alternatives and check the packaging/style gates on touched public items. *Project mode:* hunt for dead code, lingering compatibility shims, and outdated patterns across the package(s).

## Checks

- **Root-cause over patches.** Pre-stable: no compatibility shims, no back-compat wrappers "to avoid breaking callers" (there are none to protect). Prefer a clean redesign over a symptom patch; flag a shim as should-fix with a redesign suggestion. Pre-existing defects and design smells in the blast radius (touched files and their close callers/callees) are in scope.
- **Dead / useless code.** No-caller exports, speculative generality (one impl, no near-term second), commented-out blocks, leftover scaffolding. Remove. Commented-out code is a should-fix — git history exists.
- **Simplicity.** The simplest design that fully solves it. Over-abstraction (an adapter seam with a single impl and no real second, a generic where a concrete type reads better) is as much a finding as under-design. The genesis charter warns against indirection that hurts DX — flag it.
- **ESM / packaging discipline.** `"type": "module"`, `"sideEffects": false`, correct `exports` (`.` and, where present, `./client`), `"files": ["dist"]`, `typecheck` separate from `build`. A CJS interop hack, a wrong/missing `exports` condition, a committed `dist/`, or a `dist`-less publishable package is a should-fix.
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
grep -l '"main"\|"require"' packages/*/package.json                       # CJS leftovers in an ESM-only kit
```

Then `bun run lint` for the style gate and `bun run check-versions` for the catalog gate.
