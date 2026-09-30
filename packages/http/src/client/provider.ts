"use client"

import { createContext, createElement, type ReactNode, useContext } from "react"
import type { HttpClient } from "../exchange"

const HttpClientContext = createContext<HttpClient | null>(null)

/** Props for {@link HttpClientProvider}. */
export interface HttpClientProviderProps {
  /**
   * The client to provide. The host builds it: once per request on the server, and once at startup
   * (for example in `useState`) in the browser. Never a module-level singleton.
   */
  readonly client: HttpClient
  readonly children?: ReactNode
}

/** Make `client` available to {@link useHttpClient} for everything rendered below it. */
export function HttpClientProvider({ client, children }: HttpClientProviderProps): ReactNode {
  return createElement(HttpClientContext.Provider, { value: client }, children)
}

/**
 * The {@link HttpClient} from the nearest {@link HttpClientProvider}.
 *
 * @throws {Error} When no provider is above the caller.
 */
export function useHttpClient(): HttpClient {
  const client = useContext(HttpClientContext)
  if (client === null) {
    throw new Error("useHttpClient must be used inside <HttpClientProvider>.")
  }
  return client
}
