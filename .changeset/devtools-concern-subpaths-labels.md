---
"@plainworks/devtools": minor
---

Redesign the devtools entries, host wiring, controls, and copy.

- **Concern subpaths.** `.` now carries only the protocol vocabulary and the `Source` types. The session, store, retention, privacy, and bridge live on `./session`, `./store`, `./retention`, `./privacy`, and `./bridge`. Import each name from its concern entry.
- **Your wording.** Every inspector string comes from `DevtoolsLabels`. Pass `labels` to `mountDevtools` or `DevtoolsShell` to translate or reword any of it; custom renderers receive the resolved labels.
- **Atom controls.** Rail entries, JSON tree toggles, and event details are `@plainworks/elements` buttons and collapsibles, so they share the kit's focus, keyboard, and target-size behavior.
- **One launcher for every host.** `./launch` adds `launchDevtools`. It builds the HTTP and channel seams at startup, then mounts the inspector once the app runs, with the query source, channel observation, lazy loading, cancellation, and failure reporting built in. Hosts keep only the build-time gate and the dynamic import.
