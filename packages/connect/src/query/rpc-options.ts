import type { DescMessage, DescMethodUnary, MessageInitShape } from "@bufbuild/protobuf"
import type { Transport } from "@connectrpc/connect"
import {
  type QueryOptions,
  type QueryOptionsWithSkipToken,
  type SkipToken,
  createQueryOptions as upstreamQueryOptions,
} from "@connectrpc/connect-query-core"
import type { WebHeadersInit } from "@plainworks/std/web"
import { mapConnectError } from "../errors"

type Options = { transport: Transport; headers?: WebHeadersInit }
type Owned<O extends DescMessage> = QueryOptions<O> & { retry: false }
type Skipped<O extends DescMessage> = QueryOptionsWithSkipToken<O> & { retry: false }

export function createQueryOptions<I extends DescMessage, O extends DescMessage>(
  schema: DescMethodUnary<I, O>,
  input: MessageInitShape<I> | undefined,
  options: Options,
): Owned<O>
export function createQueryOptions<I extends DescMessage, O extends DescMessage>(
  schema: DescMethodUnary<I, O>,
  input: SkipToken | MessageInitShape<I> | undefined,
  options: Options,
): Owned<O> | Skipped<O>
/** Query owns caching and refetches; the transport alone owns retry attempts. */
export function createQueryOptions<I extends DescMessage, O extends DescMessage>(
  schema: DescMethodUnary<I, O>,
  input: SkipToken | MessageInitShape<I> | undefined,
  options: Options,
): Owned<O> | Skipped<O> {
  const query = upstreamQueryOptions(schema, input, options)
  const queryFn = query.queryFn
  if (typeof queryFn !== "function") return { ...query, queryFn, retry: false }
  return {
    ...query,
    retry: false,
    queryFn: async (context) => {
      try {
        return await queryFn(context)
      } catch (error) {
        throw mapConnectError(error)
      }
    },
  }
}
