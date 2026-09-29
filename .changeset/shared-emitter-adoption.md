---
"@plainworks/auth": patch
"@plainworks/devtools": patch
"@plainworks/state": patch
---

Use the shared std emitter for change listeners. A listener that throws no longer stops the others; its error surfaces once every listener has run. The devtools client port now reports a subscriber's error to the bridge instead of hiding it.
