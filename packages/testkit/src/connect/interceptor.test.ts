import { describe, expect, test } from "vitest"
import { EchoService } from "./fixtures"
import { fakeStreamRequest, fakeUnaryRequest, fakeUnaryResponse } from "./interceptor"

const echo = EchoService.method.echo
const count = EchoService.method.count

describe("fakeUnaryRequest", () => {
  test("defaults message, headers, signal, and url", () => {
    const request = fakeUnaryRequest(echo)

    expect(request.stream).toBe(false)
    expect(request.method).toBe(echo)
    expect(request.message.message).toBe("")
    expect([...request.header]).toEqual([])
    expect(request.signal.aborted).toBe(false)
    expect(request.url).toBe("https://fake.test/plainworks.testkit.v1.EchoService/Echo")
  })

  test("applies provided message, header, signal, and url", () => {
    const controller = new AbortController()
    const request = fakeUnaryRequest(echo, {
      message: { message: "ping" },
      header: { "x-test": "1" },
      signal: controller.signal,
      url: "https://api.test/echo",
    })

    expect(request.message.message).toBe("ping")
    expect(request.header.get("x-test")).toBe("1")
    expect(request.signal).toBe(controller.signal)
    expect(request.url).toBe("https://api.test/echo")
  })
})

describe("fakeUnaryResponse", () => {
  test("builds a typed response with headers and trailers", () => {
    const response = fakeUnaryResponse(
      echo,
      { message: "pong" },
      { header: { "x-h": "h" }, trailer: { "x-t": "t" } },
    )

    expect(response.stream).toBe(false)
    expect(response.message.message).toBe("pong")
    expect(response.header.get("x-h")).toBe("h")
    expect(response.trailer.get("x-t")).toBe("t")
  })
})

describe("fakeStreamRequest", () => {
  test("yields the provided messages in order", async () => {
    const request = fakeStreamRequest(count, { messages: [{ count: 1 }, { count: 2 }] })

    expect(request.stream).toBe(true)
    const counts: number[] = []
    for await (const message of request.message) {
      counts.push(message.count)
    }
    expect(counts).toEqual([1, 2])
  })

  test("yields nothing by default", async () => {
    const request = fakeStreamRequest(count)

    const counts: number[] = []
    for await (const message of request.message) {
      counts.push(message.count)
    }
    expect(counts).toEqual([])
  })
})
