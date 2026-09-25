---
"@plainworks/devtools": minor
---

`mountDevtools` now takes the sources to observe and owns the session it builds, so one idempotent `dispose` releases the shell, every source, and the session. Hosts no longer track registrations by hand; `DevtoolsShell` remains the component form for a session you own. The mount's session settings are now `sessionOptions`, so they no longer read like the shell's live `session`.

`sanitizeHttpUrl` gains a `"path"` scope for single-origin backends, the shipped stylesheet carries a sentinel rule so a leaked development stylesheet is detectable in a production build, and the launcher shortcut and warning contrast improved. The query adapter republishes its indicator only when query state changes, so observer churn during render no longer interrupts the host's hydration. HTTP and Connect indicators recover after a failed exchange instead of staying red, and disposing an older session no longer detaches a newer one from a shared adapter. Documents development-only Vite and Next.js setup, custom panels, lifecycle ownership, and troubleshooting, and proves the embedded inspector through consumer journeys for discovery, commands, bounded history, accessibility, and teardown.
