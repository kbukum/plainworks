---
"@plainworks/theme": minor
"@plainworks/ui": minor
---

System mode now follows the OS color scheme in CSS, so a server-rendered page paints dark on a dark OS before hydration with no flash and no class change. `resolveTheme(preference)` takes only the preference and returns `{ htmlClass }`; system mode adds no mode class, and the `colorScheme` result and the OS-preference argument are gone. The `dark:` variant also matches system mode on a dark OS.
