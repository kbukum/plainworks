---
"@plainworks/devtools": minor
---

Add `@plainworks/devtools/client`, the embedded inspector shell over the neutral session, plus a client-side session store in the neutral entry.

- **One signal model, two presentations** — a compact diagnostics rail and a focus-managed, dockable inspector (Overview, unified Timeline, one panel per source kind) both read the same `createDevtoolsStore` state; the rail is a prioritized view, never a second telemetry channel.
- **Bounded and honest** — the timeline renders only what the session retained; pause freezes presentation without growing collection (resume rehydrates from the host), clear empties the visible history, and dropped events stay reported.
- **Extension at the call site** — kind-keyed custom panels (`SourceRendererMap`) are injected into the shell; unknown kinds render through a generic panel with indicators, risk-separated commands (destructive requires confirmation), and on-demand detail. No React value ever crosses the protocol.
- **Accessible by default** — keyboard-complete with a configurable global shortcut and focus restoration, screen-reader named regions and tabs, WCAG 2.2 AA axe coverage, container-adaptive layout, and reduced-motion/color-scheme aware styling via `@plainworks/devtools/styles.css`.
- **Host-owned gating** — `mountDevtools` mounts into an isolated React root and returns teardown; the package performs no work at import time and never inspects the environment. A Vite consumer fixture proves the documented dynamic-import pattern emits devtools JavaScript and CSS in development and neither in production.

The session snapshot now also carries source failures, so a late-connecting client sees a broken adapter instead of a silently missing one.
