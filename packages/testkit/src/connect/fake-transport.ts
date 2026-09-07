import type {
  DescMessage,
  DescMethodServerStreaming,
  DescMethodUnary,
  DescService,
} from "@bufbuild/protobuf"
import type { ConnectRouter, MethodImpl, Transport } from "@connectrpc/connect"
import { createRouterTransport } from "@connectrpc/connect"
import { PlainError, type WebHeaders } from "@plainworks/std"

/**
 * A unary responder: return the response init, or throw a `ConnectError` to fail the call. This is
 * Connect's own unary `MethodImpl`, so a canned response is just `(req) => ({ ... })` and a failure
 * is a throw — see {@link failUnary} for an ergonomic failure factory.
 */
export type FakeUnaryHandler<I extends DescMessage, O extends DescMessage> = MethodImpl<
  DescMethodUnary<I, O>
>

/** A server-streaming responder — Connect's own streaming `MethodImpl` (returns an async iterable). */
export type FakeStreamHandler<I extends DescMessage, O extends DescMessage> = MethodImpl<
  DescMethodServerStreaming<I, O>
>

/** One call recorded by a {@link FakeConnectTransport}, captured as it reaches the handler. */
export interface FakeConnectCall {
  /** Fully-qualified service name, e.g. `plainworks.testkit.v1.EchoService`. */
  readonly service: string
  /** RPC name as declared in the proto, e.g. `Echo`. */
  readonly method: string
  /** Whether the call is server-streaming. */
  readonly stream: boolean
  /** Request headers received on the wire — assert auth-header injection here. */
  readonly header: WebHeaders
  /** The decoded request message (the first message for a stream). */
  readonly input: unknown
}

/**
 * A network-free Connect {@link Transport} that routes calls to canned responders, built on Connect's
 * own `createRouterTransport` — the idiomatic in-process test tool. Configure responders, hand
 * `transport` to the code under test (a `TransportProvider`, a `createConnectRpcTransport` consumer,
 * or connect-query hooks), then assert against `calls`.
 *
 * Register every responder **before** reading `transport`: the router is built lazily on first
 * access and cached, so the configured routes are frozen once the transport is handed out. A late
 * registration is rejected with a typed error rather than silently ignored. A responder that must
 * vary across attempts (e.g. fail-then-succeed for a retry test) is a stateful closure, not
 * re-registration.
 */
export interface FakeConnectTransport {
  /** The injectable transport — pass this wherever the code under test takes a Connect `Transport`. */
  readonly transport: Transport
  /** Every call that reached a registered responder, in order. */
  readonly calls: readonly FakeConnectCall[]
  /**
   * Register (or replace) the responder for a unary method. Returns `this` for chaining. Throws if
   * called after `transport` has been read.
   */
  unary<I extends DescMessage, O extends DescMessage>(
    method: DescMethodUnary<I, O>,
    handler: FakeUnaryHandler<I, O>,
  ): FakeConnectTransport
  /**
   * Register (or replace) the responder for a server-streaming method. Returns `this` for chaining.
   * Throws if called after `transport` has been read.
   */
  serverStream<I extends DescMessage, O extends DescMessage>(
    method: DescMethodServerStreaming<I, O>,
    handler: FakeStreamHandler<I, O>,
  ): FakeConnectTransport
}

/** A router registration deferred until the transport is built. */
type Registration = (router: ConnectRouter) => void

/**
 * Build a {@link FakeConnectTransport} for `service`. Every responder is a typed Connect handler, so
 * the fake never widens a request/response away from its proto type, and each call is recorded with
 * its wire headers and decoded input for assertions.
 */
export function createFakeConnectTransport(service: DescService): FakeConnectTransport {
  const calls: FakeConnectCall[] = []
  const registrations: Registration[] = []
  let transport: Transport | undefined

  const record = (
    method: { name: string },
    stream: boolean,
    header: WebHeaders,
    input: unknown,
  ) => {
    calls.push({ service: service.typeName, method: method.name, stream, header, input })
  }

  const handle: FakeConnectTransport = {
    get transport(): Transport {
      transport ??= createRouterTransport((router) => {
        for (const apply of registrations) {
          apply(router)
        }
      })
      return transport
    },
    get calls(): readonly FakeConnectCall[] {
      return calls
    },
    unary(method, handler) {
      register(method.name, (router) => {
        router.rpc(method, (request, context) => {
          record(method, false, context.requestHeader, request)
          return handler(request, context)
        })
      })
      return handle
    },
    serverStream(method, handler) {
      register(method.name, (router) => {
        router.rpc(method, (request, context) => {
          record(method, true, context.requestHeader, request)
          return handler(request, context)
        })
      })
      return handle
    },
  }
  return handle

  /**
   * Queue a route registration, rejecting one that arrives after `transport` has been built. The
   * router is cached on first `transport` access, so a late responder would never be consumed —
   * fail loudly with an actionable typed error instead of silently doing nothing.
   */
  function register(methodName: string, registration: Registration): void {
    if (transport !== undefined) {
      throw new PlainError(
        "testkit/connect-late-registration",
        `Cannot register responder for "${service.typeName}.${methodName}" after \`transport\` has been read: the router is built and cached on first access. Register every responder before handing out \`transport\`.`,
      )
    }
    registrations.push(registration)
  }
}
