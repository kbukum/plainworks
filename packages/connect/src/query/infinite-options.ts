import type { DescMessage, DescMethodUnary, MessageInitShape } from "@bufbuild/protobuf"
import type { Transport } from "@connectrpc/connect"
import {
  type ConnectInfiniteQueryOptions,
  type InfiniteQueryOptions,
  type InfiniteQueryOptionsWithSkipToken,
  type MessageInitWithPageParam,
  type MessagePageParamKey,
  type SkipToken,
  createInfiniteQueryOptions as upstreamInfiniteOptions,
} from "@connectrpc/connect-query-core"
import { mapConnectError } from "../errors"

type Key<I extends DescMessage> = MessagePageParamKey<MessageInitShape<I>>
type Options<
  I extends DescMessage,
  O extends DescMessage,
  K extends Key<I>,
> = ConnectInfiniteQueryOptions<I, O, K> & { transport: Transport }
type Owned<I extends DescMessage, O extends DescMessage, K extends Key<I>> = InfiniteQueryOptions<
  I,
  O,
  K
> & { retry: false }
type Skipped<
  I extends DescMessage,
  O extends DescMessage,
  K extends Key<I>,
> = InfiniteQueryOptionsWithSkipToken<I, O, K> & { retry: false }

export function createInfiniteQueryOptions<
  I extends DescMessage,
  O extends DescMessage,
  K extends Key<I>,
>(
  schema: DescMethodUnary<I, O>,
  input: MessageInitWithPageParam<MessageInitShape<I>, K>,
  options: Options<I, O, K>,
): Owned<I, O, K>
export function createInfiniteQueryOptions<
  I extends DescMessage,
  O extends DescMessage,
  K extends Key<I>,
>(
  schema: DescMethodUnary<I, O>,
  input: SkipToken | MessageInitWithPageParam<MessageInitShape<I>, K>,
  options: Options<I, O, K>,
): Owned<I, O, K> | Skipped<I, O, K>
/** Infinite pages share the finite query contract: transport retries, never Query retries. */
export function createInfiniteQueryOptions<
  I extends DescMessage,
  O extends DescMessage,
  K extends Key<I>,
>(
  schema: DescMethodUnary<I, O>,
  input: SkipToken | MessageInitWithPageParam<MessageInitShape<I>, K>,
  options: Options<I, O, K>,
): Owned<I, O, K> | Skipped<I, O, K> {
  const query = upstreamInfiniteOptions(schema, input, options)
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
