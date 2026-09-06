import { fakeAuthHeaderProvider } from "@plainworks/testkit"
import { expect, test } from "vitest"
import type { HttpRequest } from "../exchange/request"
import { authHeaderInterceptor } from "./auth"
import type { HttpHandler } from "./handler"

function baseRequest(): HttpRequest {
  return { method: "GET", url: "https://api.test/x", headers: new Headers() }
}

function capturing(): { handler: HttpHandler; seen: HttpRequest[] } {
  const seen: HttpRequest[] = []
  const handler: HttpHandler = async (request) => {
    seen.push(request)
    return new Response("{}", { status: 200 })
  }
  return { handler, seen }
}

test("injects the provider's headers without mutating the base request", async () => {
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer token" } })
  const { handler, seen } = capturing()
  const request = baseRequest()

  await authHeaderInterceptor(auth.provider)(handler)(request)

  expect(seen[0]?.headers.get("authorization")).toBe("Bearer token")
  expect(request.headers.get("authorization")).toBeNull()
  expect(auth.calls).toBe(1)
})

test("passes the request through untouched when the provider is unauthenticated", async () => {
  const auth = fakeAuthHeaderProvider()
  const { handler, seen } = capturing()
  const request = baseRequest()

  await authHeaderInterceptor(auth.provider)(handler)(request)

  expect(seen[0]).toBe(request)
})

test("consults the async provider on each call", async () => {
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "Bearer a" }, async: true })
  const { handler, seen } = capturing()

  await authHeaderInterceptor(auth.provider)(handler)(baseRequest())
  auth.setHeaders({ authorization: "Bearer b" })
  await authHeaderInterceptor(auth.provider)(handler)(baseRequest())

  expect(seen[0]?.headers.get("authorization")).toBe("Bearer a")
  expect(seen[1]?.headers.get("authorization")).toBe("Bearer b")
})

test("passes the attempt's abort signal to the provider so a refresh honors cancellation", async () => {
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "t" }, async: true })
  const { handler } = capturing()
  const controller = new AbortController()
  const request: HttpRequest = { ...baseRequest(), signal: controller.signal }

  await authHeaderInterceptor(auth.provider)(handler)(request)

  expect(auth.signals[0]).toBe(controller.signal)
})

test("omits the signal from the provider context when the attempt carries none", async () => {
  const auth = fakeAuthHeaderProvider({ headers: { authorization: "t" } })
  const { handler } = capturing()

  await authHeaderInterceptor(auth.provider)(handler)(baseRequest())

  expect(auth.signals[0]).toBeUndefined()
})
