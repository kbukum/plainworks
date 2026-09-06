import { expect, test } from "vitest"
import type { HttpRequest } from "../exchange/request"
import type { HttpHandler } from "./handler"
import { type LoggedRequest, type LoggedResponse, loggingInterceptor } from "./logging"

const SECRET_TOKEN = "abc.def.ghi"

function requestWithAuth(): HttpRequest {
  const headers = new Headers({ authorization: `Bearer ${SECRET_TOKEN}`, "x-trace": "abc" })
  return { method: "GET", url: "https://api.test/x", headers }
}

test("reports a redacted request and response to the hooks", async () => {
  const requests: LoggedRequest[] = []
  const responses: LoggedResponse[] = []
  const handler: HttpHandler = async () =>
    new Response("{}", { status: 201, headers: { "set-cookie": "sid=1" } })

  await loggingInterceptor({
    onRequest: (r) => requests.push(r),
    onResponse: (r) => responses.push(r),
  })(handler)(requestWithAuth())

  expect(requests[0]?.headers.authorization).toBe("[REDACTED]")
  expect(requests[0]?.headers["x-trace"]).toBe("abc")
  expect(responses[0]?.status).toBe(201)
  expect(responses[0]?.headers["set-cookie"]).toBe("[REDACTED]")
})

test("strips userinfo, query, and fragment from the logged request and response url", async () => {
  const requests: LoggedRequest[] = []
  const responses: LoggedResponse[] = []
  const headers = new Headers({ "x-trace": "abc" })
  const request: HttpRequest = {
    method: "GET",
    url: "https://user:s3cret@api.test/x?access_token=leak#frag",
    headers,
  }
  const handler: HttpHandler = async () => new Response("{}", { status: 200 })

  await loggingInterceptor({
    onRequest: (r) => requests.push(r),
    onResponse: (r) => responses.push(r),
  })(handler)(request)

  expect(requests[0]?.url).toBe("https://api.test/x")
  expect(requests[0]?.url).not.toContain("s3cret")
  expect(requests[0]?.url).not.toContain("leak")
  expect(requests[0]?.url).not.toContain("frag")
  expect(responses[0]?.url).toBe("https://api.test/x")
})

test("reduces an unparsable url to a fixed placeholder so a raw credential-bearing string never leaks", async () => {
  const requests: LoggedRequest[] = []
  const request: HttpRequest = {
    method: "GET",
    url: "not-a-url?token=live-secret",
    headers: new Headers(),
  }
  const handler: HttpHandler = async () => new Response("{}", { status: 200 })

  await loggingInterceptor({ onRequest: (r) => requests.push(r) })(handler)(request)

  expect(requests[0]?.url).toBe("[unparsable-url]")
  expect(requests[0]?.url).not.toContain("live-secret")
})

test("redacts a token-shaped error message before onError and rethrows the original", async () => {
  const failure = new Error(`Bearer ${SECRET_TOKEN}`)
  const errors: unknown[] = []
  const handler: HttpHandler = async () => {
    throw failure
  }

  await expect(
    loggingInterceptor({ onError: (error) => errors.push(error) })(handler)(requestWithAuth()),
  ).rejects.toBe(failure)
  // The observability payload is a redacted copy, never the live error object.
  expect(errors[0]).not.toBe(failure)
  expect(JSON.stringify(errors[0])).not.toContain(SECRET_TOKEN)
})

test("masks a sensitively-named enumerable field on the error before onError", async () => {
  const failure = Object.assign(new Error("request failed"), { apiKey: "live-key-value" })
  const errors: unknown[] = []
  const handler: HttpHandler = async () => {
    throw failure
  }

  await expect(
    loggingInterceptor({ onError: (error) => errors.push(error) })(handler)(requestWithAuth()),
  ).rejects.toBe(failure)
  expect((errors[0] as Record<string, unknown>).apiKey).toBe("[REDACTED]")
})

test("masks an embedded credential inside an error message before onError", async () => {
  const failure = new Error("upstream rejected access_token=live-secret for tenant 7")
  const errors: unknown[] = []
  const handler: HttpHandler = async () => {
    throw failure
  }

  await expect(
    loggingInterceptor({ onError: (error) => errors.push(error) })(handler)(requestWithAuth()),
  ).rejects.toBe(failure)
  const view = errors[0] as Record<string, unknown>
  expect(view.message).toBe("upstream rejected access_token=[REDACTED] for tenant 7")
})

test("surfaces an error accessor without invoking it, so logging never runs getter code", async () => {
  let invoked = false
  const failure = new Error("boom")
  Object.defineProperty(failure, "leak", {
    enumerable: true,
    get() {
      invoked = true
      return "live-secret"
    },
  })
  const errors: unknown[] = []
  const handler: HttpHandler = async () => {
    throw failure
  }

  await expect(
    loggingInterceptor({ onError: (error) => errors.push(error) })(handler)(requestWithAuth()),
  ).rejects.toBe(failure)
  expect(invoked).toBe(false)
  expect((errors[0] as Record<string, unknown>).leak).toBe("[Getter]")
})

test("always hands the sink a headers record, even when maxDepth would truncate it", async () => {
  const requests: LoggedRequest[] = []
  const handler: HttpHandler = async () => new Response("{}", { status: 200 })

  await loggingInterceptor({ onRequest: (r) => requests.push(r) }, { maxDepth: 0 })(handler)(
    requestWithAuth(),
  )

  expect(typeof requests[0]?.headers).toBe("object")
  expect(requests[0]?.headers.authorization).toBe("[REDACTED]")
})
