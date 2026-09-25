"use client"

import { createHttpClient, type HttpClient, type HttpInterceptor } from "@plainworks/http"
import { createContext, type ReactElement, type ReactNode, useContext, useState } from "react"

const HttpClientContext = createContext<HttpClient | null>(null)

/** Props for {@link HttpClientProvider}. */
export interface HttpClientProviderProps {
  /** The absolute origin the request was served from, resolved on the server for a stable base. */
  readonly origin: string
  /** Interceptors woven into the client at build time — the development HTTP source's, when active. */
  readonly interceptors?: readonly HttpInterceptor[]
  readonly children: ReactNode
}

/**
 * Provide one browser {@link HttpClient} scoped to the request origin. The origin is resolved on
 * the server and passed down, so the base is identical during SSR and hydration (no mismatch) and
 * every client `/api/*` read lands on the same backend the RSC prefetch used. Built once via
 * `useState`, never a module-level singleton.
 */
export function HttpClientProvider({
  origin,
  interceptors,
  children,
}: HttpClientProviderProps): ReactElement {
  const [client] = useState(() =>
    createHttpClient(interceptors ? { baseUrl: origin, interceptors } : { baseUrl: origin }),
  )
  return <HttpClientContext.Provider value={client}>{children}</HttpClientContext.Provider>
}

/** Read the request-scoped browser HTTP client; throws when used outside {@link HttpClientProvider}. */
export function useHttpClient(): HttpClient {
  const client = useContext(HttpClientContext)
  if (client === null) {
    throw new Error("useHttpClient must be used inside <HttpClientProvider>.")
  }
  return client
}
