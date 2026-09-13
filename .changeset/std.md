---
"@plainworks/std": patch
---

Add `@plainworks/std`, the shared foundation every other package builds on. It has no dependencies and runs anywhere.

It provides the common building blocks the kit reuses instead of each package inventing its own: typed errors that keep their cause, a result type for success-or-failure, small type guards and assertions, and a handful of utilities. It also defines the shared contracts higher layers implement, so things like auth headers and event shapes have a single definition that can never drift.
