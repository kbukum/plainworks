---
"@plainworks/devtools": minor
---

Redesign devtools around the shared `@plainworks/std` primitives: public time injection now uses `clock?: Clock`, and JSON protocol types and validation come from std. Sanitization keeps devtools allowlists, then redacts and bounds payloads through std JSON coercion.
