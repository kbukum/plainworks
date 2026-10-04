---
applyTo: "packages/**/*.ts,packages/**/*.tsx,apps/**/*.ts,apps/**/*.tsx,internal/**/*.ts,internal/**/*.tsx"
---

# TypeScript

Apply the [baseline](../copilot-instructions.md). Read [code style](../engineering.md#code-style) and [architecture invariants](../engineering.md#architecture-invariants) for relevant APIs.

- Strict ESM, `isolatedDeclarations`, bundler resolution. No `any`, unchecked `as`/`!`, string throws, or logic in barrels. Use concern-qualified names.
- Neutral entries remain host-independent; client directives are per-module, never global banners. Client code never imports server custody.
- Host-owned factories establish process/request/browser lifetimes; persistent authoritative stores must not be recreated per request. No globals or import-time I/O.
- Imports point strictly downward; reusable mechanics belong in the lower owner. Integrations/drivers do not hide in core subpaths or optional peers.
- Derived manifests come from `tsdown.config.ts` and `bun run sync-shape`. Preserve the compiler boundary; never hand-edit vendored atoms or their lock.
- Test-first with Vitest/testkit; deterministic clocks/RNG and failures. Use `.test.ts` for logic and `.test.tsx`/jsdom for DOM. Coverage >=80% per package and >=85% for auth; no threshold reductions.

Use [validate](../skills/validate/SKILL.md) for scoped verification. Structural changes require shape/boundary checks. TS comment prose wraps at 100 columns; Markdown does not.
