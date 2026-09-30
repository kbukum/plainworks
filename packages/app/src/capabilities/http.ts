"use client"

import type { HttpClient } from "@plainworks/http"
import { HttpClientProvider } from "@plainworks/http/client"
import { createElement } from "react"
import { type ClientCapability, defineProvider } from "../client/capability"

/** Options for {@link createHttpCapability}. */
export interface HttpCapabilityOptions {
  /**
   * The HTTP client to provide. The caller builds it (one per request on the server, one at
   * startup in the browser), so the recipe holds no singleton.
   */
  readonly client: HttpClient
  /** The capability id; defaults to `"http"`. */
  readonly id?: string
  /** Ids this capability mounts inside; rarely needed. */
  readonly dependsOn?: readonly string[]
}

/**
 * Provide a caller-owned HTTP client to the app, so components read it with `useHttpClient` from
 * `@plainworks/http/client`. A thin wrapper over `HttpClientProvider`: mount that yourself and you
 * lose only this convenience.
 */
export function createHttpCapability(options: HttpCapabilityOptions): ClientCapability {
  const { client, id = "http", dependsOn } = options
  return defineProvider({
    id,
    ...(dependsOn === undefined ? {} : { dependsOn }),
    provider: ({ children }) => createElement(HttpClientProvider, { client, children }),
  })
}
