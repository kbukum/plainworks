---
"@plainworks/std": patch
"@plainworks/http": patch
"@plainworks/connect": patch
"@plainworks/channel": patch
"@plainworks/theme": patch
"@plainworks/app": patch
"@plainworks/mocks": patch
"@plainworks/testkit": patch
"@plainworks/devtools": patch
---

Every entry now lists its exports by name, and shared typed errors live in one `errors` folder per package. Import paths and names are unchanged. `@plainworks/channel/client` now compiles without DOM types, so it runs on React Native.
