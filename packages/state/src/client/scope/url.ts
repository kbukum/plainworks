"use client"

import type { StateCapabilities, StateSource } from "@plainworks/std"
import { StateSourceError } from "../../errors"
import type { Scope, SourceSpec } from "../../scope/scope"
import { createStringSource, type StringBackend } from "./string-source"

/**
 * The navigation surface a URL scope reads and writes. `read` returns the current href; `replace`
 * swaps the URL without a full navigation; `subscribe` fires on back/forward (and hash) navigation.
 * Injectable so tests drive the scope without a real `location`/`history`.
 */
export interface UrlHost {
  /** The current full URL. */
  read(): string
  /** Replace the URL in place (no reload), e.g. via `history.replaceState`/`pushState`. */
  replace(next: string): void
  /** Observe user navigation (`popstate`/`hashchange`); returns teardown. */
  subscribe(onChange: () => void): () => void
}

/** Where a URL scope keeps its value — a search parameter (`?key=…`) or within the hash. */
export type UrlMode = "search" | "hash"

/** Options for {@link createUrlScope}. */
export interface UrlScopeOptions {
  /** Inject the navigation host (tests, SSR); defaults to `location` + `history`, typed error when absent. */
  readonly host?: UrlHost
  /** Store the value in the `?search` params (default) or the `#hash`. */
  readonly mode?: UrlMode
}

// A URL param is shareable/bookmarkable but not durable (a fresh navigation drops it), lives per
// tab, and needs a host to read — so it is not available at import. It is not an automatic server
// channel like a cookie; it only reaches the server on the next full navigation.
const URL_CAPABILITIES: StateCapabilities = {
  access: "sync",
  authority: "local",
  durable: false,
  sharedAcrossTabs: false,
  sentToServer: false,
  availableAtImport: false,
}

function resolveHostUrl(): UrlHost {
  if (typeof location === "undefined" || typeof history === "undefined") {
    throw new StateSourceError(
      "No location/history is available; pass options.host to build the url scope off the host.",
    )
  }
  return {
    read: () => location.href,
    replace: (next) => history.replaceState(history.state, "", next),
    subscribe: (onChange) => {
      window.addEventListener("popstate", onChange)
      window.addEventListener("hashchange", onChange)
      return () => {
        window.removeEventListener("popstate", onChange)
        window.removeEventListener("hashchange", onChange)
      }
    },
  }
}

/** Read the value param out of the current URL's search or hash. */
function readParam(host: UrlHost, mode: UrlMode, key: string): string | null {
  const url = new URL(host.read())
  const params =
    mode === "search" ? url.searchParams : new URLSearchParams(url.hash.replace(/^#/, ""))
  return params.get(key)
}

/** Produce the next href with `key` set to (or cleared from) the search or hash params. */
function withParam(host: UrlHost, mode: UrlMode, key: string, value: string | null): string {
  const url = new URL(host.read())
  const params =
    mode === "search" ? url.searchParams : new URLSearchParams(url.hash.replace(/^#/, ""))
  if (value === null) {
    params.delete(key)
  } else {
    params.set(key, value)
  }
  if (mode === "search") {
    url.search = params.toString()
  } else {
    const hash = params.toString()
    url.hash = hash.length > 0 ? `#${hash}` : ""
  }
  return url.toString()
}

/**
 * Build a **url** scope: keep a value in the address bar's `?search` params (default) or `#hash`,
 * so it is shareable and survives back/forward. Writes swap the URL in place
 * (`history.replaceState`, so a rapid update never floods the back button) and reads observe
 * `popstate`/`hashchange`. Host access is deferred to the first read/write (inside the surface's
 * client-only `connect`), so both importing the scope and building its source during SSR touch no
 * `location`.
 *
 * URL state is world-visible — keep it non-secret, and note it is not durable across a fresh
 * navigation.
 */
export function createUrlScope(options: UrlScopeOptions = {}): Scope {
  const mode = options.mode ?? "search"
  return {
    name: "url",
    capabilities: URL_CAPABILITIES,
    createSource<Value>(spec: SourceSpec<Value>): StateSource<Value> {
      // Resolve the host lazily on first use, not at construction: the Provider builds the source
      // during render (SSR included), but reads/writes only fire from the client-only `connect`
      // effect and event handlers — so the server never touches `location` and never throws.
      let cached: UrlHost | undefined
      const host = (): UrlHost => (cached ??= options.host ?? resolveHostUrl())
      const backend: StringBackend = {
        read: () => readParam(host(), mode, spec.key),
        write: (raw) => host().replace(withParam(host(), mode, spec.key, raw)),
        clear: () => host().replace(withParam(host(), mode, spec.key, null)),
        subscribeExternal: (onChange) => host().subscribe(onChange),
      }
      return createStringSource({
        capabilities: URL_CAPABILITIES,
        serializer: spec.serializer,
        backend,
        medium: "url",
        ...(spec.schema !== undefined ? { schema: spec.schema } : {}),
      })
    },
  }
}

/** The **url** scope with host defaults: value in the `?search` params, in-place `replace`. */
export const urlScope: Scope = createUrlScope()
