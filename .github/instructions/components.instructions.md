---
applyTo: "packages/**/*.tsx,apps/**/*.tsx,packages/*/src/client.ts,packages/**/src/client/**/*.ts"
---

Interactive React in a `@plainworks/*` client binding (`./client`, `"use client"`) or an app. This is the load-bearing summary for **UI/client** work; follow the full baseline in [`../copilot-instructions.md`](../copilot-instructions.md). Accessibility and responsiveness are **acceptance criteria here, not a follow-up** — a component that ships inaccessible or non-responsive is not done.

Separation of concerns (the host-independence seam):

- **Server-safe logic stays out of the client leaf.** Pure logic, types, schemas, and contracts live in the server-safe `.` graph (or `@plainworks/std`); the `"use client"` module holds only what genuinely needs the DOM/hooks. The barrel (`index.ts` / `client.ts`) re-exports only. A `"use client"` module must never import server-only auth/token-custody code.
- **Non-DOM client hooks stay DOM-free (React-without-DOM bucket).** A `./client` hook that only needs React state/effects — `state`/`query`/`channel`/`auth` bindings — must not reach for `document`/`window`/`localStorage`, so it also runs under React Native / Expo. Only genuinely DOM-bound code (`ui` components, CSS, focus/measure) may touch those globals; that code is DOM-only and out of scope for RN. See `docs/architecture.md › Axis 2` (three entry buckets).
- **`"use client"` is per-module, at the top of the file** — tsdown preserves it; never a global banner (it would poison the server entry).

Accessibility — WCAG 2.2 AA, non-negotiable:

- **Semantic HTML first, ARIA to fill gaps.** Real `button`/`a`/`label`/`nav`/heading structure over `div` + `onClick`. Every control has an accessible name; form controls are label-associated.
- **Keyboard + focus.** Everything operable by pointer is operable by keyboard; focus order is logical; the focus ring is visible and **not obscured** (2.4.11); no keyboard traps.
- **Target size** ≥ `24×24` CSS px for pointer targets (2.5.8); **contrast** ≥ 4.5:1 text / 3:1 UI (1.4.3/1.4.11).
- **Prove it in the test.** Every client component test includes an axe assertion (`expect(await axe(container)).toHaveNoViolations()`). Automation catches ~57% of issues — it is a floor; keyboard operability, focus order, and role correctness are still asserted behaviorally.

Responsive & adaptive:

- **Mobile-first, fluid.** Relative units (`rem`/`%`/`ch`), `clamp()` for type (never `vw`-only — it breaks zoom, 1.4.4), `minmax()`/`auto-fit`/`min()` grids. **No fixed-pixel width/height traps** and no horizontal scroll at 320px / 200% zoom.
- **Container queries for component adaptivity** (`container-type: inline-size` + `@container`) so a component adapts to the space it's placed in, not the viewport; reserve viewport media queries for page shell. Baseline-supported in current browsers; ship sane base styles as fallback.
- **Honor user preferences** — `prefers-reduced-motion` (drop or simplify non-essential motion), `prefers-color-scheme` (theme via tokens/CSS custom properties, not hardcoded colors).

Performance:

- Code-split heavy/route-level surfaces behind `React.lazy` + `Suspense` with a meaningful fallback. Keep components small and let the React compiler memoize — add `memo`/`useMemo`/`useCallback` only when a profile shows a win. Virtualize large lists. Per-component subpath exports + `"sideEffects": false` keep the bundle tree-shakeable.
- Every effect that subscribes/times/opens returns its cleanup; no work continues after unmount (also the async-teardown baseline).

Tests (Vitest + React Testing Library, test-first, DOM env):

- Write the failing test first. Query the way a user perceives the UI — `getByRole`/`getByLabelText` first, `getByTestId` only as a last resort; drive interaction with `@testing-library/user-event` (`userEvent.setup()`), **not** `fireEvent`. Never assert on class names or internal state. Component tests run under jsdom (the generated client `vitest.config.ts`, or a per-file `// @vitest-environment jsdom`).
- Mock the network at the boundary with **MSW** (`server.listen({ onUnhandledRequest: "error" })`, reset between tests), not by stubbing `fetch`. Injected clock / seeded RNG for anything time- or random-dependent.
- Reuse render harnesses, fake transports, and the axe helper from `@plainworks/testkit` — never hand-roll a one-off. Coverage ≥ 80% (the generated `vitest.config.ts` sets it).

Scope every gate to the package you changed:

```bash
turbo run lint typecheck build test --filter=@plainworks/<name>
bun run check-boundaries                      # server/client + layer gate
```
