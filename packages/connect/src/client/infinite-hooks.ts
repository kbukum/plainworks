"use client"

import type {
  DescMessage,
  DescMethodUnary,
  MessageInitShape,
  MessageShape,
} from "@bufbuild/protobuf"
import type { Transport } from "@connectrpc/connect"
import { useTransport } from "@connectrpc/connect-query"
import type {
  ConnectInfiniteQueryOptions,
  ConnectQueryKey,
  MessageInitWithPageParam,
  MessagePageParamKey,
  MessagePageParamValue,
} from "@connectrpc/connect-query-core"
import {
  type InfiniteData,
  type SkipToken,
  type UseInfiniteQueryOptions,
  type UseInfiniteQueryResult,
  type UseSuspenseInfiniteQueryOptions,
  type UseSuspenseInfiniteQueryResult,
  useInfiniteQuery as useTanStackInfiniteQuery,
  useSuspenseInfiniteQuery as useTanStackSuspenseInfiniteQuery,
} from "@tanstack/react-query"
import type { RpcError } from "../errors"
import { createInfiniteQueryOptions } from "../query/infinite-options"

type Key<I extends DescMessage> = MessagePageParamKey<MessageInitShape<I>>
type Page<I extends DescMessage, K extends Key<I>> = MessagePageParamValue<MessageInitShape<I>, K>
type Options<I extends DescMessage, O extends DescMessage, K extends Key<I>, S> = Omit<
  UseInfiniteQueryOptions<MessageShape<O>, RpcError, S, ConnectQueryKey<O>, Page<I, K>>,
  "queryFn" | "queryKey" | "initialPageParam" | "getNextPageParam" | "retry" | "retryDelay"
> &
  ConnectInfiniteQueryOptions<I, O, K> & { transport?: Transport }

export function useInfiniteQuery<
  I extends DescMessage,
  O extends DescMessage,
  K extends Key<I>,
  S = InfiniteData<MessageShape<O>, Page<I, K>>,
>(
  schema: DescMethodUnary<I, O>,
  input: SkipToken | MessageInitWithPageParam<MessageInitShape<I>, K>,
  options: Options<I, O, K, S>,
): UseInfiniteQueryResult<S, RpcError> {
  const contextTransport = useTransport()
  const transport = options.transport ?? contextTransport
  const query = createInfiniteQueryOptions(schema, input, { ...options, transport })
  return useTanStackInfiniteQuery({
    ...options,
    ...query,
    retry: false,
  })
}

type SuspenseOptions<I extends DescMessage, O extends DescMessage, K extends Key<I>, S> = Omit<
  UseSuspenseInfiniteQueryOptions<MessageShape<O>, RpcError, S, ConnectQueryKey<O>, Page<I, K>>,
  "queryFn" | "queryKey" | "initialPageParam" | "getNextPageParam" | "retry" | "retryDelay"
> &
  ConnectInfiniteQueryOptions<I, O, K> & { transport?: Transport }

export function useSuspenseInfiniteQuery<
  I extends DescMessage,
  O extends DescMessage,
  K extends Key<I>,
  S = InfiniteData<MessageShape<O>, Page<I, K>>,
>(
  schema: DescMethodUnary<I, O>,
  input: MessageInitWithPageParam<MessageInitShape<I>, K>,
  options: SuspenseOptions<I, O, K, S>,
): UseSuspenseInfiniteQueryResult<S, RpcError> {
  const contextTransport = useTransport()
  const transport = options.transport ?? contextTransport
  const query = createInfiniteQueryOptions(schema, input, { ...options, transport })
  return useTanStackSuspenseInfiniteQuery({
    ...options,
    ...query,
    retry: false,
  })
}
