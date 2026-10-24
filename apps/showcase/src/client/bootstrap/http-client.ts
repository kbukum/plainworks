"use client"

import { sessionFailures } from "@plainworks/auth/session"
import { createHttpClient, type HttpClient } from "@plainworks/http"
import type { HttpInterceptor } from "@plainworks/http/interceptor"
import type { ProtectedSession } from "@plainworks/std/seam"
import type { WebFetch } from "@plainworks/std/web"

/** What the browser root supplies to {@link createBrowserHttpClient}. */
export interface BrowserHttpClientOptions {
  readonly origin: string
  readonly protectedSession: ProtectedSession
  readonly interceptors?: readonly HttpInterceptor[]
  readonly fetch?: WebFetch
}

/**
 * The browser's API client. Protected writes are CSRF-checked against the session store, which
 * rejects with the session routes' problems, so `sessionFailures` reads them and a store outage
 * fails closed instead of being retried as a transient error.
 */
export function createBrowserHttpClient(options: BrowserHttpClientOptions): HttpClient {
  return createHttpClient({
    baseUrl: options.origin,
    protectedSession: options.protectedSession,
    failures: sessionFailures,
    ...(options.interceptors === undefined ? {} : { interceptors: options.interceptors }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })
}
