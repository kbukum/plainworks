// Public entry for `@plainworks/testkit/connect` — network-free Connect test tooling shipped as a
// product, so a consumer tests their Connect usage against the same fakes plainworks does. A
// re-export-only barrel (no logic here). Kept on a separate tsdown entry so a non-Connect consumer
// of `@plainworks/testkit` never pulls the Connect/protobuf dependencies. It deliberately depends
// only on third-party Connect + protobuf and the shared proto fixture — never on
// `@plainworks/connect` — so there is no package cycle.
export {
  createFakeConnectTransport,
  type FakeConnectCall,
  type FakeConnectTransport,
  type FakeStreamHandler,
  type FakeUnaryHandler,
} from "./fake-transport"
export {
  type CountRequest,
  CountRequestSchema,
  type CountResponse,
  CountResponseSchema,
  countRequest,
  countResponse,
  type EchoRequest,
  EchoRequestSchema,
  type EchoResponse,
  EchoResponseSchema,
  EchoService,
  echoRequest,
  echoResponse,
} from "./fixtures"
export {
  type FakeRequestOptions,
  fakeStreamRequest,
  fakeUnaryRequest,
  fakeUnaryResponse,
} from "./interceptor"
export { Code, failUnary } from "./responder"
