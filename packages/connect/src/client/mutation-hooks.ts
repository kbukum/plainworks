"use client"

import type {
  DescMessage,
  DescMethodUnary,
  MessageInitShape,
  MessageShape,
} from "@bufbuild/protobuf"
import type { Transport } from "@connectrpc/connect"
import { useTransport } from "@connectrpc/connect-query"
import { callUnaryMethod } from "@connectrpc/connect-query-core"
import {
  type UseMutationOptions,
  type UseMutationResult,
  useMutation as useTanStackMutation,
} from "@tanstack/react-query"
import { mapConnectError, type RpcError } from "../errors"

type Options<I extends DescMessage, O extends DescMessage, C> = Omit<
  UseMutationOptions<MessageShape<O>, RpcError, MessageInitShape<I>, C>,
  "mutationFn" | "retry" | "retryDelay"
> & { transport?: Transport }

export function useMutation<I extends DescMessage, O extends DescMessage, C = unknown>(
  schema: DescMethodUnary<I, O>,
  options: Options<I, O, C> = {},
): UseMutationResult<MessageShape<O>, RpcError, MessageInitShape<I>, C> {
  const contextTransport = useTransport()
  const transport = options.transport ?? contextTransport
  return useTanStackMutation({
    ...options,
    retry: false,
    mutationFn: async (input) => {
      try {
        return await callUnaryMethod(transport, schema, input)
      } catch (error) {
        throw mapConnectError(error)
      }
    },
  })
}
