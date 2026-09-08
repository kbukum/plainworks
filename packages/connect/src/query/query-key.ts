import type { DescMessage, DescMethodUnary, MessageInitShape } from "@bufbuild/protobuf"
import type { Transport } from "@connectrpc/connect"
import { type ConnectQueryKey, createConnectQueryKey } from "@connectrpc/connect-query-core"
import type { WebHeadersInit } from "@plainworks/std"
import type { SkipToken } from "@tanstack/query-core"

/** Inputs for {@link createQueryKey}. */
export interface QueryKeyParams<I extends DescMessage, O extends DescMessage> {
  /** The unary method schema, e.g. `EchoService.method.echo`. */
  readonly schema: DescMethodUnary<I, O>
  /** Request input; a `skipToken` marks the query as skipped. */
  readonly input?: MessageInitShape<I> | SkipToken
  /**
   * Transport folded into the key so keys are transport-scoped. A hand-built key **must** thread
   * the **same `transport`** the connect-query hooks use, or it will not match a hook-generated
   * cache entry.
   */
  readonly transport?: Transport
  /** Headers folded into the key when they affect the response. */
  readonly headers?: WebHeadersInit
}

/**
 * Derive a stable, structured query key for a unary Connect method — a thin, finite-cardinality
 * convenience over connect-query's `createConnectQueryKey`, so the common case reads as
 * `createQueryKey({ schema, input })`. Keys are deterministic: equal `schema` + `input` produce
 * deeply-equal keys (no `JSON.stringify` over protobuf).
 */
export function createQueryKey<I extends DescMessage, O extends DescMessage>(
  params: QueryKeyParams<I, O>,
): ConnectQueryKey<O> {
  return createConnectQueryKey({ ...params, cardinality: "finite" })
}
