// The mock backend the host serves the demo domain from — the Next route-handler equivalent of the
// showcase's `mockServerPlugin`. It reuses the published `@plainworks/mocks` primitives through
// `@plainworks/demo`'s `createMockApi` graph and dispatches an incoming `Request` straight to the
// MSW handlers via `handler.run`, so the browser's `/api/*` calls and the RSC prefetch both read
// one set of seeded fixtures over real HTTP. Pure (no `next/*`, no module state) and unit-testable,
// but server-bound: it carries the `server-only` marker so the seeded backend can never bundle into
// a client graph. The shared singleton a route handler calls lives in `backend.ts`.

import "server-only"

import { createMockApi, type MockApi, type MockApiOptions } from "@plainworks/demo"

/** The demo backend: the isolated {@link MockApi} plus a bound {@link dispatch}. */
export interface DemoBackend {
  /** The isolated mock API — seeded stores, control plane, and the MSW handlers. */
  readonly api: MockApi
  /** Route one `Request` through the mock handlers, always resolving to a `Response`. */
  dispatch(request: Request): Promise<Response>
}

/** Build a fresh, isolated demo backend. Each call seeds its own stores — no shared module state. */
export function createDemoBackend(options?: MockApiOptions): DemoBackend {
  const api = createMockApi(options)
  return {
    api,
    dispatch: (request) => dispatchMock(request, api.handlers),
  }
}

/**
 * Find the first MSW handler that matches `request` and return its `Response`. A request with no
 * matching handler resolves to a JSON `404` — the API namespace is terminal, so an unmatched path
 * is a client error, never a silent pass-through.
 */
export async function dispatchMock(
  request: Request,
  handlers: MockApi["handlers"],
): Promise<Response> {
  const requestId = crypto.randomUUID()
  for (const handler of handlers) {
    const result = await handler.run({
      request: request as Parameters<typeof handler.run>[0]["request"],
      requestId,
    })
    if (result?.response) {
      return result.response as unknown as Response
    }
  }
  return Response.json(
    { error: `No mock handler for ${request.method} ${new URL(request.url).pathname}` },
    { status: 404 },
  )
}
