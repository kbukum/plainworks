"use client"

import {
  isCookieNameToken,
  isCookiePath,
  MAX_COOKIE_BYTES,
  type StateCapabilities,
  type StateSource,
  serializeCookieAttributes,
  utf8ByteLength,
} from "@plainworks/std"
import { StateSourceError } from "../../errors"
import type { Scope, SourceSpec } from "../../scope/scope"
import { createStringSource, type StringBackend } from "./string-source"

/**
 * The read/write surface of the document's cookies a scope uses. `read` returns the raw
 * `document.cookie` string; `write` assigns one `key=value; attrs` entry (the browser merges it into
 * the jar). Injectable so tests drive the scope without a document.
 */
export interface CookieJar {
  /** The current `document.cookie` string (all cookies, `; `-joined). */
  read(): string
  /** Assign a single serialized cookie entry (`key=value; Path=/; …`). */
  write(entry: string): void
}

/** How a cookie is written — the attributes appended to every `set`. */
export interface CookieScopeOptions {
  /** Inject the cookie jar (tests, SSR); defaults to `document.cookie`, with a typed error when absent. */
  readonly jar?: CookieJar
  /** `SameSite` policy; defaults to `Lax` (sent on top-level navigations, not cross-site sub-requests). */
  readonly sameSite?: "Lax" | "Strict" | "None"
  /** Cookie `Path`; defaults to `/`. */
  readonly path?: string
  /** `Max-Age` in seconds; omitted means a session cookie (cleared when the browser closes). */
  readonly maxAgeSeconds?: number
  /** Force the `Secure` attribute; defaults to on unless the page is served over plain `http:`. */
  readonly secure?: boolean
}

// A cookie is transmitted to the server on every matching request and is world-readable to any
// script on the origin, so it must stay small and non-secret. `sentToServer: true` is the signal a
// consumer reads to keep tokens/secrets out of this scope (auth custody uses a `__Host-` HttpOnly
// cookie via the server-owned SessionStore instead). There is no cookie change event, so a cookie is
// not observable across tabs; subscribers still see this source's own writes.
const COOKIE_CAPABILITIES: StateCapabilities = {
  access: "sync",
  authority: "local",
  durable: true,
  sharedAcrossTabs: false,
  sentToServer: true,
  availableAtImport: false,
}

function resolveHostJar(): CookieJar {
  if (typeof document === "undefined") {
    throw new StateSourceError(
      "No document is available; pass options.jar to build the cookie scope off the host.",
    )
  }
  return {
    read: () => document.cookie,
    write: (entry) => {
      // biome-ignore lint/suspicious/noDocumentCookie: assigning one `key=value; attrs` entry is the cookie API (the browser merges it into the jar); this is the host default and tests inject a jar.
      document.cookie = entry
    },
  }
}

function readCookie(jar: CookieJar, key: string): string | null {
  const prefix = `${key}=`
  for (const part of jar.read().split("; ")) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length))
    }
  }
  return null
}

function cookieAttributes(options: CookieScopeOptions): string {
  const path = options.path ?? "/"
  if (!isCookiePath(path)) {
    throw new StateSourceError(
      `Cookie path "${path}" is invalid; it must start with "/" and contain no spaces, ";", or ",".`,
    )
  }
  const secure = options.secure ?? !isInsecureHost()
  return serializeCookieAttributes({
    path,
    sameSite: options.sameSite ?? "Lax",
    secure,
    ...(options.maxAgeSeconds !== undefined ? { maxAgeSeconds: options.maxAgeSeconds } : {}),
  })
}

function isInsecureHost(): boolean {
  return typeof location !== "undefined" && location.protocol === "http:"
}

/**
 * Build a **cookie** scope for **non-secret, client-readable** state (a theme, a consent flag). The
 * value is `encodeURIComponent`-encoded and written with `Path`/`SameSite`/`Secure` attributes; a
 * write that would exceed the ~4KB per-cookie budget raises a typed error instead of being silently
 * dropped. Host access is deferred to the first read/write (inside the surface's client-only
 * `connect`), so both importing the scope and building its source during SSR touch no cookie.
 *
 * Never store a token or secret here — a cookie in this scope is readable by any script on the origin
 * **and** sent to the server on every request. Secure server session custody is `auth`'s job.
 */
export function createCookieScope(options: CookieScopeOptions = {}): Scope {
  return {
    name: "cookie",
    capabilities: COOKIE_CAPABILITIES,
    createSource<Value>(spec: SourceSpec<Value>): StateSource<Value> {
      // Resolve the jar lazily on first use, not at construction: the Provider builds the source
      // during render (SSR included), but reads/writes only fire from the client-only `connect`
      // effect and event handlers — so the server never touches `document.cookie` and never throws.
      let cached: CookieJar | undefined
      const jar = (): CookieJar => (cached ??= options.jar ?? resolveHostJar())
      const attributes = cookieAttributes(options)
      if (!isCookieNameToken(spec.key)) {
        throw new StateSourceError(
          `Cookie name "${spec.key}" is not a valid RFC 6265 token (no controls, spaces, or separators).`,
        )
      }
      const backend: StringBackend = {
        read: () => readCookie(jar(), spec.key),
        write: (raw) => {
          const entry = `${spec.key}=${encodeURIComponent(raw)}; ${attributes}`
          const bytes = utf8ByteLength(entry)
          if (bytes > MAX_COOKIE_BYTES) {
            throw new StateSourceError(
              `Cookie "${spec.key}" is ${bytes} bytes, over the ~${MAX_COOKIE_BYTES}-byte limit.`,
            )
          }
          jar().write(entry)
        },
        clear: () => {
          jar().write(`${spec.key}=; ${attributes}; Max-Age=0`)
        },
      }
      return createStringSource({
        capabilities: COOKIE_CAPABILITIES,
        serializer: spec.serializer,
        backend,
        medium: "cookie",
        ...(spec.schema !== undefined ? { schema: spec.schema } : {}),
      })
    },
  }
}

/** The **cookie** scope with host defaults (`SameSite=Lax`, `Path=/`, `Secure` off plain http). */
export const cookieScope: Scope = createCookieScope()
