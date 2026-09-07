import type { Interceptor } from "@connectrpc/connect"
import { fakeAuthHeaderProvider } from "@plainworks/testkit"
import { EchoService, fakeUnaryRequest, fakeUnaryResponse } from "@plainworks/testkit/connect"
import { describe, expect, test } from "vitest"
import { authHeaderInterceptor, injectedAuthHeadersKey } from "./auth-header"

type NextFn = Parameters<Interceptor>[0]
type Request = Parameters<NextFn>[0]

const echo = EchoService.method.echo
const response = fakeUnaryResponse(echo, { message: "ok" })

/** A terminal `next` that records the request it received and resolves with a canned response. */
function recordingNext() {
  const seen: Request[] = []
  const next: NextFn = (request) => {
    seen.push(request)
    return Promise.resolve(response)
  }
  return { next, seen }
}

describe("authHeaderInterceptor", () => {
  test("injects the provider's headers onto the request", async () => {
    const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer token" } })
    const { next, seen } = recordingNext()
    const request = fakeUnaryRequest(echo)

    await authHeaderInterceptor(auth.provider)(next)(request)

    expect(seen[0]?.header.get("authorization")).toBe("Bearer token")
  })

  test("passes through untouched when the provider is unauthenticated", async () => {
    const auth = fakeAuthHeaderProvider()
    const { next, seen } = recordingNext()
    const request = fakeUnaryRequest(echo)

    await authHeaderInterceptor(auth.provider)(next)(request)

    expect(seen[0]?.header.has("authorization")).toBe(false)
  })

  test("resolves the credential per attempt", async () => {
    const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer a" } })
    const intercepted = authHeaderInterceptor(auth.provider)(recordingNext().next)

    await intercepted(fakeUnaryRequest(echo))
    await intercepted(fakeUnaryRequest(echo))

    expect(auth.calls).toBe(2)
  })

  test("forwards the attempt's abort signal to the provider as its AuthContext", async () => {
    const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer a" }, async: true })
    const controller = new AbortController()
    const request = fakeUnaryRequest(echo, { signal: controller.signal })

    await authHeaderInterceptor(auth.provider)(recordingNext().next)(request)

    expect(auth.signals[0]).toBe(controller.signal)
  })

  test("records the injected header names on the request context for the origin guard", async () => {
    const auth = fakeAuthHeaderProvider({ headers: { "x-proof": "secret" } })
    const { next, seen } = recordingNext()
    const request = fakeUnaryRequest(echo)

    await authHeaderInterceptor(auth.provider)(next)(request)

    expect(seen[0]?.contextValues.get(injectedAuthHeadersKey)).toEqual(["x-proof"])
  })

  test("does not leak a credential onto a later attempt that reuses the request", async () => {
    const auth = fakeAuthHeaderProvider({ headers: { authorization: "******" } })
    const { next, seen } = recordingNext()
    const intercepted = authHeaderInterceptor(auth.provider)(next)
    const request = fakeUnaryRequest(echo)

    await intercepted(request)
    auth.setHeaders(undefined)
    await intercepted(request)

    expect(seen[0]?.header.get("authorization")).toBe("******")
    expect(seen[1]?.header.has("authorization")).toBe(false)
    // The base request the retry driver reuses is never mutated, so the vanished credential is gone.
    expect(request.header.has("authorization")).toBe(false)
  })
})
