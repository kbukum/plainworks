"use client"

import type {
  DescMessage,
  DescMethodUnary,
  MessageInitShape,
  MessageShape,
} from "@bufbuild/protobuf"
import type { Transport } from "@connectrpc/connect"
import { useTransport } from "@connectrpc/connect-query"
import type { ConnectQueryKey, SkipToken } from "@connectrpc/connect-query-core"
import type { WebHeadersInit } from "@plainworks/std/web"
import {
  type UseQueryOptions,
  type UseQueryResult,
  type UseSuspenseQueryOptions,
  type UseSuspenseQueryResult,
  useQueries as useTanStackQueries,
  useQuery as useTanStackQuery,
  useSuspenseQuery as useTanStackSuspenseQuery,
} from "@tanstack/react-query"
import type { RpcError } from "../errors"
import { createQueryOptions } from "../query/rpc-options"

type QueryOptions<O extends DescMessage, S> = Omit<
  UseQueryOptions<MessageShape<O>, RpcError, S, ConnectQueryKey<O>>,
  "queryKey" | "queryFn" | "retry" | "retryDelay"
> & { transport?: Transport; headers?: WebHeadersInit }

export function useQuery<I extends DescMessage, O extends DescMessage, S = MessageShape<O>>(
  schema: DescMethodUnary<I, O>,
  input?: SkipToken | MessageInitShape<I>,
  options: QueryOptions<O, S> = {},
): UseQueryResult<S, RpcError> {
  const contextTransport = useTransport()
  const transport = options.transport ?? contextTransport
  return useTanStackQuery({
    ...options,
    ...createQueryOptions(schema, input, { ...options, transport }),
    retry: false,
  })
}

type SuspenseOptions<O extends DescMessage, S> = Omit<
  UseSuspenseQueryOptions<MessageShape<O>, RpcError, S, ConnectQueryKey<O>>,
  "queryKey" | "queryFn" | "retry" | "retryDelay"
> & { transport?: Transport; headers?: WebHeadersInit }

export function useSuspenseQuery<I extends DescMessage, O extends DescMessage, S = MessageShape<O>>(
  schema: DescMethodUnary<I, O>,
  input?: MessageInitShape<I>,
  options: SuspenseOptions<O, S> = {},
): UseSuspenseQueryResult<S, RpcError> {
  const contextTransport = useTransport()
  const transport = options.transport ?? contextTransport
  return useTanStackSuspenseQuery({
    ...options,
    ...createQueryOptions(schema, input, { ...options, transport }),
    retry: false,
  })
}

/**
 * Reads one unary method for each input, in input order: one result per input, each cached under
 * its own key and never retried by Query, the same as {@link useQuery}. For a list of per-item
 * reads whose length is only known at render time; the caller bounds how many inputs it passes.
 */
export function useQueries<I extends DescMessage, O extends DescMessage, S = MessageShape<O>>(
  schema: DescMethodUnary<I, O>,
  inputs: readonly MessageInitShape<I>[],
  options: QueryOptions<O, S> = {},
): UseQueryResult<S, RpcError>[] {
  const contextTransport = useTransport()
  const transport = options.transport ?? contextTransport
  return useTanStackQueries({
    queries: inputs.map((input) => ({
      ...options,
      ...createQueryOptions(schema, input, { ...options, transport }),
      retry: false as const,
    })),
  }) as UseQueryResult<S, RpcError>[]
}
