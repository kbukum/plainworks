---
"@plainworks/theme": patch
---

Add `@plainworks/theme`, the design substrate the whole UI family renders against. It ships:

- The design tokens, semantic color roles, nine color schemes, and dark mode.
- A server-safe way to resolve a theme and apply it before hydration, so there is no flash.
- A single stylesheet and the `cn` class helper.

It runs anywhere, including React Native, and works with a strict Content Security Policy.
