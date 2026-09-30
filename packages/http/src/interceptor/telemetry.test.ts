import { recordTelemetry } from "@plainworks/testkit/fakes"
import { expect, test } from "vitest"
import { HttpError } from "../errors"
import type { HttpRequest } from "../exchange/request"
import type { HttpHandler } from "./handler"
import { telemetryInterceptor } from "./telemetry"

function request(url = "https://api.test/orders"): HttpRequest {
  return { method: "GET", url, headers: new Headers({ authorization: "Bearer live-token" }) }
}

test("reports a request as an operation with OTel HTTP client attributes", async () => {
  const telemetry = recordTelemetry()
  const handler: HttpHandler = async () => new Response("{}", { status: 201 })

  await telemetryInterceptor(telemetry)(handler)(request())

  expect(telemetry.records).toEqual([
    {
      kind: "start",
      name: "http.client.request",
      attributes: {
        "http.request.method": "GET",
        "url.full": "https://api.test/orders",
        "server.address": "api.test",
      },
    },
    {
      kind: "finish",
      name: "http.client.request",
      attributes: {
        "http.request.method": "GET",
        "url.full": "https://api.test/orders",
        "server.address": "api.test",
        "http.response.status_code": 201,
      },
    },
  ])
})

test("never reports headers, userinfo, query or fragment", async () => {
  const telemetry = recordTelemetry()
  const handler: HttpHandler = async () => new Response("{}", { status: 200 })

  await telemetryInterceptor(telemetry)(handler)(
    request("https://user:s3cret@api.test/x?access_token=leak#frag"),
  )

  const reported = JSON.stringify(telemetry.records)
  expect(reported).toContain('"url.full":"https://api.test/x"')
  for (const secret of ["s3cret", "leak", "frag", "live-token"]) {
    expect(reported).not.toContain(secret)
  }
})

test("reduces an unparsable url to a placeholder and omits the server address", async () => {
  const telemetry = recordTelemetry()
  const handler: HttpHandler = async () => new Response("{}", { status: 200 })

  await telemetryInterceptor(telemetry)(handler)(request("not-a-url?token=live-secret"))

  expect(telemetry.records[0]?.attributes).toEqual({
    "http.request.method": "GET",
    "url.full": "[unparsable-url]",
  })
})

test("a non-2xx response fails with the status code as the error type", async () => {
  const telemetry = recordTelemetry()
  const handler: HttpHandler = async () => new Response("{}", { status: 503 })

  const response = await telemetryInterceptor(telemetry)(handler)(request())

  expect(response.status).toBe(503)
  expect(telemetry.records[1]).toMatchObject({
    kind: "fail",
    failure: { type: "503" },
    attributes: { "http.response.status_code": 503 },
  })
})

test("a thrown error fails with its redacted kind and is rethrown unchanged", async () => {
  const telemetry = recordTelemetry()
  const failure = HttpError.network({ message: "upstream rejected access_token=live-secret" })
  const handler: HttpHandler = async () => {
    throw failure
  }

  await expect(telemetryInterceptor(telemetry)(handler)(request())).rejects.toBe(failure)

  const record = telemetry.records[1]
  expect(record?.kind).toBe("fail")
  if (record?.kind === "fail") {
    expect(record.failure.type).toBe("http/network")
    expect(record.failure.message).not.toContain("live-secret")
  }
})
