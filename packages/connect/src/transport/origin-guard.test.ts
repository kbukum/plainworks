import { Code, ConnectError, type Interceptor } from "@connectrpc/connect"
import { EchoService, fakeUnaryRequest, fakeUnaryResponse } from "@plainworks/testkit/connect"
import { describe, expect, test } from "vitest"
import { injectedAuthHeadersKey } from "../interceptor/auth-header"
import { originGuardInterceptor } from "./origin-guard"

type NextFn = Parameters<Interceptor>[0]
type Request = Parameters<NextFn>[0]

const echo = EchoService.method.echo
const response = fakeUnaryResponse(echo, { message: "ok" })
const BASE_URL = "https://api.test"

/** A terminal `next` that records the request it received and resolves with a canned response. */
function recordingNext() {
  const seen: Request[] = []
  const next: NextFn = (request) => {
    seen.push(request)
    return Promise.resolve(response)
  }
  return { next, seen }
}

describe("originGuardInterceptor", () => {
  test("allows a same-origin request carrying a credential", async () => {
    const { next, seen } = recordingNext()
    const request = fakeUnaryRequest(echo, {
      url: `${BASE_URL}/echo`,
      header: { authorization: "******" },
    })

    await originGuardInterceptor(BASE_URL)(next)(request)

    expect(seen).toHaveLength(1)
  })

  test("rejects a cross-origin rewrite that carries a credential", async () => {
    const { next, seen } = recordingNext()
    const request = fakeUnaryRequest(echo, {
      url: "https://evil.test/echo",
      header: { authorization: "******" },
    })

    const error = await originGuardInterceptor(BASE_URL)(next)(request).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.PermissionDenied)
    expect(seen).toHaveLength(0)
  })

  test("rejects a cross-origin rewrite carrying a custom credential header (x-api-key)", async () => {
    const { next, seen } = recordingNext()
    const request = fakeUnaryRequest(echo, {
      url: "https://evil.test/echo",
      header: { "x-api-key": "secret" },
    })

    const error = await originGuardInterceptor(BASE_URL)(next)(request).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.PermissionDenied)
    expect(seen).toHaveLength(0)
  })

  test("rejects a cross-origin rewrite carrying an auth-injected header of any name", async () => {
    const { next, seen } = recordingNext()
    const base = fakeUnaryRequest(echo, {
      url: "https://evil.test/echo",
      header: { "x-proof": "secret" },
    })
    // `x-proof` matches no sensitive-key vocabulary; the guard knows it is a credential only
    // because the auth interceptor recorded injecting it on this attempt.
    const request = {
      ...base,
      contextValues: base.contextValues.set(injectedAuthHeadersKey, ["x-proof"]),
    }

    const error = await originGuardInterceptor(BASE_URL)(next)(request).catch(
      (reason: unknown) => reason,
    )

    expect(error).toBeInstanceOf(ConnectError)
    expect((error as ConnectError).code).toBe(Code.PermissionDenied)
    expect(seen).toHaveLength(0)
  })

  test("allows a cross-origin request that carries no credential", async () => {
    const { next, seen } = recordingNext()
    const request = fakeUnaryRequest(echo, { url: "https://cdn.test/echo" })

    await originGuardInterceptor(BASE_URL)(next)(request)

    expect(seen).toHaveLength(1)
  })
})
