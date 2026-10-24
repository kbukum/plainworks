# UI

Use only when the change touches interactive UI: a `"use client"` module, a `./client` entry, a `.tsx` component, or its styles and tests. Consuming apps render these directly, so accessibility and responsiveness are acceptance criteria.

Rules: [UI quality](../../../engineering.md#ui-quality), [Vendored atoms](../../../engineering.md#vendored-atoms). Model: [UI package family](../../../../docs/architecture.md#ui-package-family), [Browser gate](../../../../docs/browser-gate.md).

**Changes:** each touched component, its test, and the app flows it reaches. **Project:** every `./client` entry and `.tsx` component.

## Checks

| Finding | Severity |
|---|---|
| Clickable non-semantic element, control without an accessible name, or custom widget without keyboard and focus management | blocker |
| Keyboard trap, or focus hidden or obscured | blocker |
| Hand-edited vendored atom or lock, or a re-added upstream variant | blocker |
| Server custody reachable from a client module | blocker |
| Failing app flow for a touched journey | blocker |
| Target under `24×24` CSS px, or contrast under 4.5:1 for text and 3:1 for UI | should-fix |
| Render test file that never awaits `expectNoAxeViolations` | should-fix |
| Fixed-pixel trap, overflow at 320 px or 200% zoom, or `vw`-only type | should-fix |
| Viewport media query where the component should adapt to its container | should-fix |
| Motion without a reduced-motion path; hardcoded light-only colors | should-fix |
| Heavy eager import instead of `lazy` and `Suspense`; memoization without a profiled win | should-fix |
| Neutral logic stranded in a `"use client"` module | should-fix |
| New journey without a flow, a flow whose `covers` misses files it exercises, or captures that do not match the intent | should-fix |

Axe finds only part of WCAG issues; judge keyboard flow, focus, roles, and real-viewport behavior by reading the component and opening the captures. A theme change that atoms depend on keeps `src/theme-variables.test.ts` and the showcase gallery flow green. Never accept a checkpoint `allow` entry without a reason that names the product decision.

## Detection starters

```bash
rg -n "onClick" packages/*/src --glob '*.tsx' | rg -v "button|<a\b|role="
rg -n "\b\d{2,}px\b" packages/*/src --glob '*.css' --glob '*.tsx'
rg -n "@media \(" packages/*/src --glob '*.css'
rg -n "useMemo|useCallback|memo\(" packages/*/src --glob '*.tsx'
bun run check-axe-coverage
bun run check-registry             # when elements changed
bun run --filter @plainworks/<app> ui:capture --flow <flow>
```
