import { PlainError } from "@plainworks/std"
import { raceAbort } from "@plainworks/std/resilience"
import { MockControlError, type MockControlTransport } from "./client"

/** Minimal API-request response used by Playwright and compatible runners. */
export interface ApiRequestResponse {
  ok(): boolean
  status(): number
  json(): Promise<unknown>
}

/** Minimal API request context used by {@link createApiRequestMockControlTransport}. */
export interface ApiRequestContext {
  get(path: string): Promise<ApiRequestResponse>
  post(path: string, options?: { readonly data?: unknown }): Promise<ApiRequestResponse>
  delete(path: string): Promise<ApiRequestResponse>
}

/** A mock control request failed before its response body could be validated. */
export class MockControlRequestError extends PlainError<"mocks/control-request-failed"> {
  override readonly name: string = "MockControlRequestError"
  readonly path: string
  readonly status: number

  constructor(path: string, status: number) {
    super(
      "mocks/control-request-failed",
      `The mock control request to ${path} failed with status ${status}.`,
    )
    this.path = path
    this.status = status
  }
}

/** Adapt a Playwright-compatible API request context to the mock control transport seam. */
export function createApiRequestMockControlTransport(
  request: ApiRequestContext,
  options: { readonly basePath?: string } = {},
): MockControlTransport {
  const pathOf = (path: string) => `${options.basePath ?? ""}${path}`
  const bodyOf = async (path: string, response: ApiRequestResponse): Promise<unknown> => {
    if (!response.ok()) throw new MockControlRequestError(path, response.status())
    try {
      return await response.json()
    } catch (cause) {
      throw new MockControlError(path, { cause })
    }
  }
  return {
    async get(path, requestOptions) {
      requestOptions?.signal?.throwIfAborted()
      const target = pathOf(path)
      const response = await raceAbort(request.get(target), requestOptions?.signal)
      return bodyOf(target, response)
    },
    async post(path, requestOptions) {
      requestOptions?.signal?.throwIfAborted()
      const target = pathOf(path)
      const response = await raceAbort(
        request.post(target, { data: requestOptions?.body }),
        requestOptions?.signal,
      )
      return bodyOf(target, response)
    },
    async delete(path, requestOptions) {
      requestOptions?.signal?.throwIfAborted()
      const target = pathOf(path)
      const response = await raceAbort(request.delete(target), requestOptions?.signal)
      return bodyOf(target, response)
    },
  }
}
