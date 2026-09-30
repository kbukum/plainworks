"use client"

import {
  type QueryClient,
  type QueryClientConfig,
  QueryClientProvider,
  type QueryClientProviderProps,
} from "@tanstack/react-query"
import type { ReactNode } from "react"

/** Runtime query-client factory injected by the package under test. */
export type QueryClientFactory = (options?: QueryClientConfig) => QueryClient

/** Create an isolated query client with retries disabled for deterministic tests. */
export function createTestQueryClient(
  createClient: QueryClientFactory,
  options: QueryClientConfig = {},
): QueryClient {
  return createClient({
    ...options,
    defaultOptions: {
      ...options.defaultOptions,
      queries: { retry: false, ...options.defaultOptions?.queries },
      mutations: { retry: false, ...options.defaultOptions?.mutations },
    },
  })
}

/** Props for {@link TestQueryClientProvider}. */
export interface TestQueryClientProviderProps extends Pick<QueryClientProviderProps, "client"> {
  readonly children: ReactNode
}

/** Provide a caller-owned query client to a component test. */
export function TestQueryClientProvider({
  client,
  children,
}: TestQueryClientProviderProps): ReactNode {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
