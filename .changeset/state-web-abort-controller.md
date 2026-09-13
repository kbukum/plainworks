---
"@plainworks/state": patch
---

Keep the client state package free of browser-only types so it also compiles on React Native, Expo, and other runtimes without a DOM. The internal cancellation uses a portable type instead of the browser global.
