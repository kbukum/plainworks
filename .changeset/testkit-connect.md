---
"@plainworks/testkit": patch
---

Add a Connect-RPC testing toolkit to `@plainworks/testkit`, shipped as a product. The Connect libraries are optional, and it's a separate import, so consumers who don't use Connect neither install nor bundle them.

- An in-memory transport with canned responses, forced failures, and recorded calls for assertions.
- A shared example service and message helpers, so every Connect-related package tests against one schema.
- Builders for driving an interceptor directly.

The generated code is checked in, so building and testing never need the code-generation tools.
