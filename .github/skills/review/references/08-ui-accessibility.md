# Pass 08 — UI: accessibility, responsive, performance

The client-binding pass. It runs **only when the change touches interactive UI** — a `"use client"` module, a `./client` entry, a `.tsx` component, or its styles/tests. plainworks ships client bindings that consuming apps render directly, so an inaccessible or non-responsive component propagates to every app that adopts it. Accessibility and responsiveness are **acceptance criteria, not follow-ups** — treat a gap here as a blocker on a UI change, not a nit.

> **Run in a separate, clean-context agent** with a high-capability model. A plan/spec may be passed in as a scope checklist only; it never excuses a baseline violation. Skip this pass with an explicit note when no UI/client code is in scope.

**Scope note.** *Changes mode:* audit each touched component and its test for the checks below. *Project mode:* sweep every `./client` entry / `.tsx` component in the package(s) for the same invariants.

## Accessibility — WCAG 2.2 AA

- **Semantic first, ARIA to fill gaps.** Real `button`/`a`/`label`/`nav`/heading structure over `div`+`onClick`. Every control has an accessible name; form controls are label-associated. A clickable non-semantic element with no role/keyboard handler is a blocker.
- **Keyboard & focus.** Pointer-operable is keyboard-operable; focus order logical; a **visible focus ring not obscured** by sticky/overlay content (2.4.11); no keyboard trap. A custom control (menu, dialog, combobox) without keyboard support or focus management is a blocker.
- **Target size & contrast.** Pointer targets ≥ `24×24` CSS px (2.5.8, minus the listed exceptions); text contrast ≥ 4.5:1, UI/graphics ≥ 3:1 (1.4.3/1.4.11).
- **Automated floor in the test.** Each client component test asserts axe cleanliness (`expect(await axe(container)).toHaveNoViolations()`). Its **absence on a new/changed component is a should-fix**. Automation catches ~57% of WCAG issues — a green axe run is a floor, never proof; keyboard operability, focus order, and role correctness are still judged by reading the component.

## Responsive & adaptive

- **Mobile-first & fluid.** Relative units, `clamp()` type (not `vw`-only — breaks zoom, 1.4.4), `minmax()`/`auto-fit`/`min()` grids. A **fixed-pixel width/height trap**, horizontal scroll at 320px, or breakage at 200% zoom is a should-fix.
- **Container queries for component adaptivity.** A component that adapts to its own container uses `container-type` + `@container`, not a viewport media query keyed to page width — a component that only works at one viewport width because it read the viewport instead of its container is a should-fix.
- **User preferences honored.** Non-essential motion respects `prefers-reduced-motion`; color respects `prefers-color-scheme` via tokens/custom properties, not hardcoded light-only colors. Motion with no reduced-motion path is a should-fix.

## Performance

- **Code-split the heavy stuff.** Route-level and heavy components load behind `React.lazy` + `Suspense` with a real fallback; a large eager import that inflates the initial bundle is a should-fix.
- **Memoize on evidence, not reflex.** Keep components small and let the React compiler do the work; `memo`/`useMemo`/`useCallback` added prophylactically (no profiled win, stable-cheap render) is a should-fix — it adds cost and noise. The inverse — an expensive re-render or an unstable prop feeding a heavy child — is the real finding.
- **Tree-shakeable surface.** Per-component subpath exports, `"sideEffects": false`, no barrel that pulls the whole package into every import. Virtualize large lists.
- **Effect teardown.** Every subscribe/timer/observer effect returns cleanup; no work after unmount (cross-refs pass 02 async).

## Separation of concerns (host-independence)

- Pure logic/types/schemas live in the server-safe `.` graph (or `std`); the `"use client"` leaf holds only DOM/hook-bound code. Logic that could be server-safe stranded inside a `"use client"` module is a should-fix (it needlessly widens the client graph). Server-only auth/token code reachable from a `"use client"` module is a blocker (also pass 03).

## Detection starters

Flag candidates, not verdicts — read each hit.

```bash
rg -n "onClick" packages/*/src --glob '*.tsx' | rg -v "button|<a\b|role="   # click on a non-semantic element
rg -n "\b\d{2,}px\b" packages/*/src --glob '*.css' --glob '*.tsx'           # fixed-pixel sizing — check for a fluid alternative
rg -n "@media \(" packages/*/src --glob '*.css'                            # viewport query where a container query may belong
rg -Ln "toHaveNoViolations|axe\(" packages/*/src/**/*.test.tsx             # client tests missing an axe assertion
rg -n "useMemo|useCallback|memo\(" packages/*/src --glob '*.tsx'           # confirm each has a profiled reason
rg -n "prefers-reduced-motion|prefers-color-scheme" packages/*/src         # motion/theme should honor these
```

Then run the scoped tests (`turbo run test --filter=@plainworks/<name>`) under jsdom. A green run is necessary but not sufficient — keyboard flow, focus management, contrast, and real-viewport behavior are the reviewer's to judge.
