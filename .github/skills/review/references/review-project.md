# Review project

Standing, whole-tree audit of plainworks, independent of any diff. Use it periodically, before a release, or when onboarding — to catch drift the per-change review never saw: a package that crept above its layer, a hand-rolled fake that should live in `testkit`, an inline version that dodged the catalog, a stale doc, a component that regressed on accessibility. It runs the same focused passes in [`references/`](./) in **Project mode**.

## Execution

Follow [the review skill](../SKILL.md): direct review by default; independent agents only on request. Read current source and relevant contracts. A plan is a scope checklist, not a justification for a baseline violation.

## Scope

The whole repo, or a named package/layer. Enumerate the surface first:

```bash
ls packages/*/package.json apps/*/package.json internal/*/package.json
cat internal/boundaries/layers.json                  # the layer map — the layering invariant
```

Sweep each package's `src/`, its `package.json` (`exports`/`files`/`type`/peers), and its dependency edges. The placement, acyclicity, composition, and security invariants below are properties of the whole kit, not just a diff.

## Passes

Follow the trigger table and order in [the review skill](../SKILL.md). Use each checklist's project scope. Load applicable files only; report incomplete checks and stop acceptance on structural/reuse blockers.

## Validation — the full gate is appropriate here

Unlike a change review, a project audit may run the unscoped gates:

```bash
bun run verify
```

Plus, if the generator or template is in scope, regenerate both variants and gate them (see the `validate` skill). Record each finding with the standard severity format; a project audit typically produces a prioritized list rather than a merge/no-merge verdict.
