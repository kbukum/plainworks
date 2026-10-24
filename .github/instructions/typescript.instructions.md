---
applyTo: "packages/**/*.ts,packages/**/*.tsx,apps/**/*.ts,apps/**/*.tsx,internal/**/*.ts,internal/**/*.tsx"
---

# TypeScript

Follow the sections of the [engineering standard](../engineering.md) that the change touches; most code changes touch [Public API and stability](../engineering.md#public-api-and-stability), [Host independence](../engineering.md#host-independence), [Errors, async, and composition](../engineering.md#errors-async-and-composition), and [Code structure](../engineering.md#code-structure).

- Strict ESM with `isolatedDeclarations`. No `any`, unchecked `as` or `!`, string throws, or logic in barrels.
- Host factories own process, request, and browser lifetimes; never recreate persistent authority per request. Client code never imports server custody.
- Reusable mechanics belong in the lower owner. Integrations never hide in core subpaths or optional peers.
- Derived manifest fields come from `tsdown.config.ts` and `bun run sync-shape`. Keep the [compiler boundary](../engineering.md#typescript-compiler-boundary).
- Write the failing test first: `.test.ts` for logic, `.test.tsx` with jsdom for DOM, deterministic clocks and randomness, and no lowered coverage thresholds.

Validate with the [validate skill](../skills/validate/SKILL.md); structural changes also need the shape and boundary gates. TS comment prose wraps at 100 columns; Markdown does not.
