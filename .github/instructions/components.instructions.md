---
applyTo: "packages/**/*.tsx,apps/**/*.tsx,packages/*/src/client.ts,packages/**/src/client/**/*.ts"
---

# Client and UI code

Follow [UI quality](../engineering.md#ui-quality), [Vendored atoms](../engineering.md#vendored-atoms), and [Host independence](../engineering.md#host-independence). Accessibility and responsive behavior are acceptance criteria, not follow-up work.

- Never hand-edit `elements/src/shadcn/**` or `shadcn.lock.json`; change atoms through registry tooling and the deviation ladder.
- `"use client"` is per module. `./client` stays DOM-free unless the package declares `dom`; thin Web bindings use dedicated subpaths. Components borrow host resources and never dispose their owners.
- Effects clean up subscriptions and timers, and cancellation prevents late updates.
- Tests query by role or label with `user-event` (not `fireEvent` or class assertions), use testkit harnesses and MSW mocks that reject unhandled requests, and await `expectNoAxeViolations` in every render test file.

Validate with the [validate skill](../skills/validate/SKILL.md): run registry validation when `elements` changes and `elements` tests when `theme` changes. App-visible changes need named e2e flows and captures that were opened and judged, including responsive and theme states.
