---
"@plainworks/testkit": patch
---

Add a `@plainworks/testkit/connect` subpath — network-free Connect-RPC test tooling shipped as a product. The Connect/protobuf libraries are optional peer dependencies and the subpath is its own tsdown entry, so non-Connect consumers neither install nor bundle them.

- **`createFakeConnectTransport`** — an in-memory `Transport` built on Connect's own `createRouterTransport`, with per-method canned unary/streaming responders, forced typed `ConnectError` failures (`failUnary`), and recorded calls (method, wire headers, decoded input) for assertions.
- **Shared proto fixture** — a generated `EchoService` (idempotent `Echo`, write `Mutate`, server-streaming `Count`) plus typed message factories, so `@plainworks/connect` and the upcoming rest/graphql/query steps import one canonical schema.
- **Interceptor request builders** — `fakeUnaryRequest`/`fakeUnaryResponse`/`fakeStreamRequest` drive an `Interceptor` directly with a controllable `next`.

The fixture's `*_pb.ts` is generated from `proto/plainworks/testkit/v1/echo.proto` by a dev-only buf + `protoc-gen-es` pipeline (`bun run gen:proto`) and checked in, so build/typecheck/test never need buf. The subpath depends only on third-party Connect/protobuf — never on `@plainworks/connect` — so there is no package cycle.
