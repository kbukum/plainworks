---
"@plainworks/app": patch
"@plainworks/auth": patch
"@plainworks/channel": patch
"@plainworks/connect": patch
"@plainworks/devtools": patch
"@plainworks/elements": patch
"@plainworks/http": patch
"@plainworks/mocks": patch
"@plainworks/observability": patch
"@plainworks/query": patch
"@plainworks/state": patch
"@plainworks/std": patch
"@plainworks/testkit": patch
"@plainworks/theme": patch
"@plainworks/ui": patch
"create-plainworks": minor
---

Packages now ship their TypeScript source with JavaScript and declaration source maps, so go-to-definition and stack traces land on the real source instead of built output. Each export also resolves through a plain `default` condition, so it works in every ESM resolver. No API change.

Ejected `create-plainworks` apps are leaner: the repo-only test and production-check tooling is dropped, and the app tsconfig is standalone.
