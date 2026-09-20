"use client"

import type { HttpClient } from "@plainworks/http"
import { createContext, type ReactElement, type ReactNode, useContext } from "react"

const HttpClientContext = createContext<HttpClient | null>(null)

/** Props for {@link HttpClientProvider}. */
export interface HttpClientProviderProps {
  /**
   * The request-scoped typed fetch client every section reads through. The server hands in its
   * mock-backed client and the browser hands in one based on `window.location.origin`, so the SSR
   * prefetch and the client refetch/mutations hit the same backend under the same key.
   */
  readonly client: HttpClient
  readonly children: ReactNode
}

/** Provide the one request-scoped {@link HttpClient} the sections read and mutate through. */
export function HttpClientProvider({ client, children }: HttpClientProviderProps): ReactElement {
  return <HttpClientContext.Provider value={client}>{children}</HttpClientContext.Provider>
}

/** Read the request-scoped HTTP client; throws when used outside {@link HttpClientProvider}. */
export function useHttpClient(): HttpClient {
  const client = useContext(HttpClientContext)
  if (client === null) {
    throw new Error("useHttpClient must be used inside <HttpClientProvider>.")
  }
  return client
}
