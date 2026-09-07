---
"@plainworks/std": patch
"@plainworks/http": patch
"@plainworks/state": patch
---

Document the runtime-primitive contract per package. Each README now declares which platform primitives the package depends on and their tier — **universal** (used directly) vs **non-universal** (an injected seam with a platform default and a typed error when absent) — and which of the three entry buckets (neutral `.`, DOM `./client`, React-without-DOM) it targets: `std` and `http` are neutral (`http`'s one non-universal primitive, `fetch`, stays the injected `options.fetch` seam), and `state`'s `./client` hooks are the DOM-free React-without-DOM bucket while its host-backed scope backends (Web Storage, cookie, URL) live at the separate DOM-only `./client/scope` subpath. No behavior change. The golden generator template gains the same declaration so every future package inherits it, and `@plainworks/boundaries` now structurally enforces that a package which claims host-independence (includes the `universal-web` shim) cannot silently reopen a DOM/Node surface on its neutral `.` project.
