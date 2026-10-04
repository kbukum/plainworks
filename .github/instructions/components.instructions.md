---
applyTo: "packages/**/*.tsx,apps/**/*.tsx,packages/*/src/client.ts,packages/**/src/client/**/*.ts"
---

# Client/UI acceptance

Apply the [baseline](../copilot-instructions.md). Accessibility and responsive behavior are acceptance criteria, not follow-up work.

- Never hand-edit `elements/src/shadcn/**` or `shadcn.lock.json`. Use registry tooling. Deviations go theme -> call-site props/classes -> UI wrapper; owned primitives live in `src/atoms` with full checks. See [atoms](../engineering.md#vendored-atoms).
- Pure logic/contracts stay neutral; `"use client"` is per-module. `./client` stays DOM-free unless the package declares `dom`; thin Web bindings use dedicated subpaths. Integrations/drivers remain outside core. Components borrow host resources, not dispose their owners.
- Semantic controls, accessible names/labels, logical keyboard/focus order, visible unobscured focus, no traps. WCAG 2.2 AA: >=24x24 CSS-px targets, 4.5:1 normal text contrast, 3:1 UI contrast.
- Mobile-first fluid layouts; no 320px/200%-zoom overflow traps. Use relative units, non-vw-only `clamp()` type, and container queries for component adaptation. Honor reduced motion and color preferences.
- Lazy/Suspense for heavy/routes, meaningful fallbacks, virtualized long lists. Memoize only with profiling evidence. Effects clean up subscriptions/timers; cancellation prevents late effects.
- Tests use role/label queries and `user-event`, not internal/class assertions or `fireEvent`. Use testkit harnesses and MSW via mocks with unhandled requests rejected, not fetch stubs. Inject clock/RNG.
- Every client render test file awaits `expectNoAxeViolations` from testkit/client. Also check keyboard/focus/roles; axe alone is not proof. Keep >=80% coverage and higher package thresholds.

Use [validate](../skills/validate/SKILL.md): scoped gates, boundary checks, registry validation when elements changes, elements tests when theme changes. App-visible changes require named e2e flows plus captured frames opened and judged, including responsive/theme states.
