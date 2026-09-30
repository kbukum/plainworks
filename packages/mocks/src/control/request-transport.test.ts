import { describe, expect, it, vi } from "vitest"
import { MockControlError } from "./client"
import {
  type ApiRequestContext,
  type ApiRequestResponse,
  createApiRequestMockControlTransport,
  MockControlRequestError,
} from "./request-transport"

function response(
  body: unknown,
  options: { readonly ok?: boolean; readonly status?: number } = {},
) {
  return {
    ok: () => options.ok ?? true,
    status: () => options.status ?? 200,
    json: async () => body,
  } satisfies ApiRequestResponse
}

describe("createApiRequestMockControlTransport", () => {
  it("adapts get, post, and delete calls with a base path", async () => {
    const request = {
      get: vi.fn(async () => response({ method: "get" })),
      post: vi.fn(async () => response({ method: "post" })),
      delete: vi.fn(async () => response({ method: "delete" })),
    } satisfies ApiRequestContext
    const transport = createApiRequestMockControlTransport(request, { basePath: "/api" })

    await expect(transport.get("/state")).resolves.toEqual({ method: "get" })
    await expect(transport.post("/error", { body: { enabled: true } })).resolves.toEqual({
      method: "post",
    })
    await expect(transport.delete("/requests")).resolves.toEqual({ method: "delete" })
    expect(request.get).toHaveBeenCalledWith("/api/state")
    expect(request.post).toHaveBeenCalledWith("/api/error", { data: { enabled: true } })
    expect(request.delete).toHaveBeenCalledWith("/api/requests")
  })

  it("rejects a failed response with path and status", async () => {
    const request = {
      get: vi.fn(async () => response(undefined, { ok: false, status: 503 })),
      post: vi.fn(),
      delete: vi.fn(),
    } satisfies ApiRequestContext
    const transport = createApiRequestMockControlTransport(request)

    const error = await transport.get("/state").catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(MockControlRequestError)
    expect(error).toMatchObject({ path: "/state", status: 503 })
  })

  it("rejects a body that is not JSON with a typed error that keeps the cause", async () => {
    const syntax = new SyntaxError("Unexpected token < in JSON")
    const request = {
      get: vi.fn(async () => ({
        ok: () => true,
        status: () => 200,
        json: async () => {
          throw syntax
        },
      })),
      post: vi.fn(),
      delete: vi.fn(),
    } satisfies ApiRequestContext
    const transport = createApiRequestMockControlTransport(request, { basePath: "/api" })

    const error = await transport.get("/state").catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(MockControlError)
    expect(error).toMatchObject({ path: "/api/state", cause: syntax })
  })

  it("honors caller cancellation before starting a request", async () => {
    const request = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    } satisfies ApiRequestContext
    const transport = createApiRequestMockControlTransport(request)
    const controller = new AbortController()
    controller.abort()

    await expect(transport.get("/state", { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    })
    expect(request.get).not.toHaveBeenCalled()
  })

  it.each(["get", "post", "delete"] as const)(
    "rejects an in-flight %s request when its caller aborts",
    async (method) => {
      const pending = new Promise<ApiRequestResponse>(() => undefined)
      const request = {
        get: vi.fn(() => pending),
        post: vi.fn(() => pending),
        delete: vi.fn(() => pending),
      } satisfies ApiRequestContext
      const transport = createApiRequestMockControlTransport(request)
      const controller = new AbortController()
      const call =
        method === "get"
          ? transport.get("/state", { signal: controller.signal })
          : method === "post"
            ? transport.post("/state", { signal: controller.signal })
            : transport.delete("/state", { signal: controller.signal })

      controller.abort()

      await expect(call).rejects.toMatchObject({ name: "AbortError" })
    },
  )
})
