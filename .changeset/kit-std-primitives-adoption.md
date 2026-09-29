---
"@plainworks/app": minor
"@plainworks/auth": minor
"@plainworks/channel": minor
"@plainworks/state": minor
"@plainworks/theme": minor
---

Use the shared std primitives instead of local copies: one `fetch` lookup, `readCookie`, `stringifyJson` / `escapeJsonForHtml` for the app snapshot, and the std numeric guards for size, count, and version options. Those options now require safe integers.
