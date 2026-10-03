---
"@plainworks/std": minor
"@plainworks/http": minor
"@plainworks/connect": minor
"@plainworks/ui": minor
"@plainworks/app": minor
"@plainworks/mocks": minor
"@plainworks/testkit": minor
"@plainworks/devtools": patch
---

Unify HTTP and RPC failures by application code while preserving protocol status. Decode standard server details, keep retry hints within one total budget, and make Connect transport the sole retry owner.

Add descriptor-driven Protovalidate forms, server field and request errors, and central app handling for localized messages and terminal authentication. Publish pinned wire fixtures and reusable adversarial cases.
