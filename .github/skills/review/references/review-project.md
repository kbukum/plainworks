# Review project

Standing, whole-tree audit of plainworks, independent of any diff. Use it periodically, before a release, or when onboarding — to catch drift the per-change review never saw: a package that crept above its layer, a hand-rolled fake that should live in `testkit`, an inline version that dodged the catalog, a stale doc, a component that regressed on accessibility. It runs the same focused passes in [`references/`](./) in **Project mode**.

## Run this in a separate, clean-context agent — high-capability model

Same rule as the change review: a fresh reviewer (Claude Opus 4.8), no shared session context, re-deriving every judgment from the code.

## Scope

The whole repo, or a named package/layer. Enumerate the surface first:

```bash
ls packages/*/package.json apps/*/package.json internal/*/package.json
cat internal/boundaries/.dependency-cruiser.cjs      # the LAYERS map — the layering invariant
```

Sweep each package's `src/`, its `package.json` (`exports`/`files`/`type`/peers), and its dependency edges. The placement, acyclicity, composition, and security invariants below are properties of the whole kit, not just a diff.

## Passes — Project mode

Run the focused files in order, each in its **Project mode** (pass `08` only for packages that ship interactive UI):

1. [`00-structure-placement.md`](./00-structure-placement.md) — every package in the right root/layer; the `LAYERS` map matches README + `docs/architecture.md`; no upward/sideways import or cycle anywhere; every package generator-shaped.
2. [`01-canonical-reuse.md`](./01-canonical-reuse.md) — sweep for concerns reimplemented instead of reusing `std`/the platform; long-lived internal forks are exactly what this surfaces.
3. [`02-principles.md`](./02-principles.md) — the typed-API, resilience, async, and composition invariants across the whole surface.
4. [`03-security-privacy.md`](./03-security-privacy.md) — audit every external-facing surface (auth, connection transports, any fetch/stream) for the boundary/crypto/custody invariants.
5. [`04-quality.md`](./04-quality.md) — dead code, lingering shims, outdated patterns, ESM/exports drift.
6. [`05-tests-tdd.md`](./05-tests-tdd.md) — coverage floors met per package; determinism; `testkit` reuse over hand-rolled fakes.
7. [`06-docs-supply-chain.md`](./06-docs-supply-chain.md) — the single catalog honest, `bun.lock` committed, actions SHA-pinned, docs current.
8. [`07-comments-tsdoc.md`](./07-comments-tsdoc.md) — comments/TSDoc describe the code as it is.
9. [`08-ui-accessibility.md`](./08-ui-accessibility.md) — *(UI packages only)* every `./client` entry / `.tsx` component meets WCAG 2.2 AA, is mobile-first/fluid with container-query adaptivity, honors `prefers-reduced-motion`/`-color-scheme`, code-splits and memoizes on evidence, and keeps server-safe logic out of its `"use client"` leaf.

## Validation — the full gate is appropriate here

Unlike a change review, a project audit may run the unscoped gates:

```bash
bun run check-versions && bun run lint && bun run typecheck \
  && bun run check-boundaries && bun run build && bun run test
```

Plus, if the generator or template is in scope, regenerate both variants and gate them (see the `validate` skill). Record each finding with the standard severity format; a project audit typically produces a prioritized list rather than a merge/no-merge verdict.
