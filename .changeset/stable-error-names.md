---
"@plainworks/std": minor
"@plainworks/state": minor
"@plainworks/http": minor
"@plainworks/theme": minor
"@plainworks/channel": minor
"@plainworks/connect": minor
"@plainworks/query": minor
"@plainworks/auth": minor
"@plainworks/ui": minor
"@plainworks/app": minor
"@plainworks/testkit": minor
"@plainworks/mocks": minor
"@plainworks/devtools": minor
---

Error names stay stable after bundling. Each error class declares its own `name`, so logs and stack traces show `HttpError` rather than a renamed class such as `HttpError2`. A subclass that declares no name reports `PlainError`.
