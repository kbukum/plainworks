import {
  create,
  type DescMessage,
  type DescMethodServerStreaming,
  type DescMethodUnary,
  type MessageInitShape,
} from "@bufbuild/protobuf"
import {
  createContextValues,
  type StreamRequest,
  type UnaryRequest,
  type UnaryResponse,
} from "@connectrpc/connect"
import type { WebAbortSignal, WebHeadersInit } from "@plainworks/std"

/** Shared options for the interceptor request builders. */
export interface FakeRequestOptions {
  /** Headers carried on the request (default: empty). */
  readonly header?: WebHeadersInit
  /** Abort signal for the call (default: a fresh, un-aborted signal). */
  readonly signal?: WebAbortSignal
  /** Request URL (default: a synthetic `https://fake.test/...` URL). */
  readonly url?: string
}

function requestUrl<I extends DescMessage, O extends DescMessage>(
  method: DescMethodUnary<I, O> | DescMethodServerStreaming<I, O>,
  url: string | undefined,
): string {
  return url ?? `https://fake.test/${method.parent.typeName}/${method.name}`
}

/**
 * Build a Connect {@link UnaryRequest} for exercising an `Interceptor` directly (no transport),
 * so a test drives an interceptor's request handling and passes a controllable `next`. The message
 * defaults to the zero value of the method's input type.
 */
export function fakeUnaryRequest<I extends DescMessage, O extends DescMessage>(
  method: DescMethodUnary<I, O>,
  options: FakeRequestOptions & { readonly message?: MessageInitShape<I> } = {},
): UnaryRequest<I, O> {
  return {
    stream: false,
    service: method.parent,
    method,
    requestMethod: "POST",
    url: requestUrl(method, options.url),
    signal: options.signal ?? new AbortController().signal,
    header: new Headers(options.header),
    contextValues: createContextValues(),
    message: create(method.input, options.message),
  }
}

/**
 * Build a Connect {@link UnaryResponse} for the given method — the value a fake `next` resolves
 * with on a happy-path interceptor test.
 */
export function fakeUnaryResponse<I extends DescMessage, O extends DescMessage>(
  method: DescMethodUnary<I, O>,
  message: MessageInitShape<O>,
  options: { readonly header?: WebHeadersInit; readonly trailer?: WebHeadersInit } = {},
): UnaryResponse<I, O> {
  return {
    stream: false,
    service: method.parent,
    method,
    header: new Headers(options.header),
    trailer: new Headers(options.trailer),
    message: create(method.output, message),
  }
}

/**
 * Build a Connect {@link StreamRequest} for a server-streaming method, so a test can assert an
 * interceptor passes a stream through untouched. The request messages default to none.
 */
export function fakeStreamRequest<I extends DescMessage, O extends DescMessage>(
  method: DescMethodServerStreaming<I, O>,
  options: FakeRequestOptions & { readonly messages?: readonly MessageInitShape<I>[] } = {},
): StreamRequest<I, O> {
  const messages = options.messages ?? []
  async function* input(): AsyncIterable<ReturnType<typeof create<I>>> {
    for (const message of messages) {
      yield create(method.input, message)
    }
  }
  return {
    stream: true,
    service: method.parent,
    method,
    requestMethod: "POST",
    url: requestUrl(method, options.url),
    signal: options.signal ?? new AbortController().signal,
    header: new Headers(options.header),
    contextValues: createContextValues(),
    message: input(),
  }
}
