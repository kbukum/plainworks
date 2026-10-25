/**
 * Per-scope mock instances.
 *
 * A browser gate runs many tests at once against one host. Each test's browser context names its
 * own scope in the {@link MOCK_SCOPE_HEADER} request header, and the host serves that scope from
 * its own mock instance (stores, control state, streams). A reset then clears only that test's
 * data, so one host can serve every worker. Requests without the header share one default
 * instance, which is what local development and plain `curl` use.
 */

import { isPositiveInteger, PlainError } from "@plainworks/std"
import type { WebHeaders } from "@plainworks/std/web"
import { getResponse, type HttpHandler, HttpResponse, http, type RequestHandler } from "msw"
import { MOCK_CONTROL_PATHS } from "../control/paths"
import { controlRoute } from "../control/plane"
import { problemJson } from "../failure"

/**
 * The request header that names a mock scope. Its value is an opaque id of 1 to 64 letters,
 * digits, `-`, or `_`, such as a UUID.
 */
export const MOCK_SCOPE_HEADER = "plainworks-mock-scope"

/** How many named scopes a host keeps by default before it evicts the least recently used. */
export const DEFAULT_MOCK_SCOPE_CAPACITY = 32

const SCOPE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** A request named a scope that is not a valid scope id. */
export class MockScopeError extends PlainError<"mocks/invalid-scope"> {
  override readonly name: string = "MockScopeError"

  constructor() {
    super(
      "mocks/invalid-scope",
      `The ${MOCK_SCOPE_HEADER} header must be 1 to 64 letters, digits, "-", or "_".`,
    )
  }
}

/** Options for {@link createMockScopes}. */
export interface MockScopesOptions<T> {
  /** Build a fresh, seeded instance for a new scope. */
  readonly create: () => T
  /** Free an instance's resources (streams, timers) when its scope is released or evicted. */
  readonly dispose?: (instance: T) => void
  /**
   * The most named scopes kept at once. Past it, the least recently used scope is evicted.
   * Keep it well above the number of contexts that run at once. Defaults to
   * {@link DEFAULT_MOCK_SCOPE_CAPACITY}.
   */
  readonly capacity?: number
}

/** The headers {@link MockScopes} reads: any `Headers`-like value. */
export type MockScopeHeaders = Pick<WebHeaders, "get">

/** A bounded set of mock instances, one per scope. */
export interface MockScopes<T> {
  /**
   * The instance for the scope `headers` name, created on first use. Without the header, the
   * shared default instance.
   *
   * @throws {MockScopeError} When the header is present but not a valid scope id.
   */
  resolve(headers: MockScopeHeaders): T
  /**
   * Dispose the named scope's instance, so its next request starts fresh. Returns whether the
   * scope existed. The default instance is never released.
   *
   * @throws {MockScopeError} When the header is present but not a valid scope id.
   */
  release(headers: MockScopeHeaders): boolean
  /** How many named scopes are live. The default instance is not counted. */
  readonly size: number
  /** Dispose every instance, the default one included. */
  clear(): void
}

/** Build a {@link MockScopes}. Creates no instance until a request needs one. */
export function createMockScopes<T>(options: MockScopesOptions<T>): MockScopes<T> {
  const capacity = options.capacity ?? DEFAULT_MOCK_SCOPE_CAPACITY
  if (!isPositiveInteger(capacity)) {
    throw new RangeError("createMockScopes: capacity must be a positive safe integer")
  }
  // A Map iterates in insertion order, so re-inserting on use keeps the oldest entry first.
  const named = new Map<string, T>()
  let fallback: { readonly instance: T } | undefined

  const scopeOf = (headers: MockScopeHeaders): string | undefined => {
    const scope = headers.get(MOCK_SCOPE_HEADER)
    if (scope === null) return undefined
    if (!SCOPE_ID.test(scope)) throw new MockScopeError()
    return scope
  }

  return {
    resolve(headers) {
      const scope = scopeOf(headers)
      if (scope === undefined) {
        fallback ??= { instance: options.create() }
        return fallback.instance
      }
      const existing = named.get(scope)
      if (existing !== undefined) {
        named.delete(scope)
        named.set(scope, existing)
        return existing
      }
      const instance = options.create()
      named.set(scope, instance)
      if (named.size > capacity) {
        const [oldest, evicted] = named.entries().next().value as [string, T]
        named.delete(oldest)
        options.dispose?.(evicted)
      }
      return instance
    },
    release(headers) {
      const scope = scopeOf(headers)
      if (scope === undefined) return false
      const instance = named.get(scope)
      if (instance === undefined) return false
      named.delete(scope)
      options.dispose?.(instance)
      return true
    },
    get size() {
      return named.size
    },
    clear() {
      const instances = [...named.values(), ...(fallback === undefined ? [] : [fallback.instance])]
      named.clear()
      fallback = undefined
      for (const instance of instances) options.dispose?.(instance)
    },
  }
}

function invalidScope(): Response {
  return HttpResponse.json(
    problemJson(400, { title: "Invalid mock scope", detail: new MockScopeError().message }),
    { status: 400, headers: { "content-type": "application/problem+json" } },
  )
}

/**
 * MSW handlers that serve each request from its scope's handler set. `DELETE /mock/scope` (or
 * `/api/mock/scope`) releases the request's scope. A malformed scope gets a `400` problem, and a
 * request no scoped handler matches falls through to the handlers after these.
 */
export function scopedMockHandlers<T>(
  scopes: MockScopes<T>,
  handlersOf: (instance: T) => readonly RequestHandler[],
): HttpHandler[] {
  return [
    http.delete(controlRoute(MOCK_CONTROL_PATHS.scope), ({ request }) => {
      try {
        scopes.release(request.headers)
      } catch (error) {
        if (error instanceof MockScopeError) return invalidScope()
        throw error
      }
      return HttpResponse.json({ success: true })
    }),
    http.all("*", async ({ request }) => {
      let instance: T
      try {
        instance = scopes.resolve(request.headers)
      } catch (error) {
        if (error instanceof MockScopeError) return invalidScope()
        throw error
      }
      return getResponse([...handlersOf(instance)], request)
    }),
  ]
}
