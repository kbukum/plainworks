import { EventEmitter } from "node:events"
import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { readBoundedText } from "@plainworks/std/web"
import { describe, expect, it } from "vitest"
import { sendWebResponse, toWebRequest } from "./web-bridge"

const ORIGIN = "http://127.0.0.1:5173"

function nodeRequest(options: {
  method?: string
  url?: string
  headers?: IncomingMessage["headers"]
  body?: string
}): IncomingMessage {
  const stream = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)])
  return Object.assign(stream, {
    method: options.method ?? "GET",
    url: options.url ?? "/",
    headers: options.headers ?? {},
  }) as unknown as IncomingMessage
}

interface FakeResponse extends EventEmitter {
  statusCode: number
  writableEnded: boolean
  headers: Map<string, string | string[]>
  body: string
  setHeader(name: string, value: string | string[]): void
  end(chunk?: string | Buffer): void
}

function nodeResponse(): FakeResponse {
  const res = new EventEmitter() as FakeResponse
  res.statusCode = 200
  res.writableEnded = false
  res.headers = new Map()
  res.body = ""
  res.setHeader = (name, value) => {
    res.headers.set(name.toLowerCase(), value)
  }
  res.end = (chunk) => {
    res.body += chunk === undefined ? "" : String(chunk)
    res.writableEnded = true
  }
  return res
}

describe("toWebRequest", () => {
  it("carries the URL, method, headers and body", async () => {
    const res = nodeResponse()
    const request = toWebRequest(
      nodeRequest({
        method: "POST",
        url: "/logout?x=1",
        headers: { cookie: "a=1", "content-type": "application/x-www-form-urlencoded" },
        body: "csrf=token",
      }),
      res as unknown as ServerResponse,
      ORIGIN,
    )
    expect(request.url).toBe(`${ORIGIN}/logout?x=1`)
    expect(request.method).toBe("POST")
    expect(request.headers.get("cookie")).toBe("a=1")
    expect(await readBoundedText(request.body, { maxBytes: 64 })).toBe("csrf=token")
  })

  it("keeps every value of a repeated header", () => {
    const request = toWebRequest(
      nodeRequest({ headers: { "x-many": ["one", "two"] } }),
      nodeResponse() as unknown as ServerResponse,
      ORIGIN,
    )
    expect(request.headers.get("x-many")).toBe("one, two")
  })

  it("sends no body for GET", () => {
    const request = toWebRequest(
      nodeRequest({}),
      nodeResponse() as unknown as ServerResponse,
      ORIGIN,
    )
    expect(request.body).toBeNull()
  })

  it("aborts when the client disconnects before the response ends", () => {
    const res = nodeResponse()
    const request = toWebRequest(nodeRequest({}), res as unknown as ServerResponse, ORIGIN)
    res.emit("close")
    expect(request.signal.aborted).toBe(true)
  })

  it("does not abort once the response has ended", () => {
    const res = nodeResponse()
    const request = toWebRequest(nodeRequest({}), res as unknown as ServerResponse, ORIGIN)
    res.end()
    res.emit("close")
    expect(request.signal.aborted).toBe(false)
  })
})

describe("sendWebResponse", () => {
  it("writes the status, headers and body", async () => {
    const res = nodeResponse()
    await sendWebResponse(
      res as unknown as ServerResponse,
      new Response("hello", { status: 201, headers: { "content-type": "text/plain" } }),
    )
    expect(res.statusCode).toBe(201)
    expect(res.headers.get("content-type")).toBe("text/plain")
    expect(res.body).toBe("hello")
    expect(res.writableEnded).toBe(true)
  })

  it("sends each Set-Cookie separately", async () => {
    const res = nodeResponse()
    const headers = new Headers({ location: "/" })
    headers.append("set-cookie", "a=1; Path=/")
    headers.append("set-cookie", "b=2; Path=/")
    await sendWebResponse(
      res as unknown as ServerResponse,
      new Response(null, { status: 303, headers }),
    )
    expect(res.statusCode).toBe(303)
    expect(res.headers.get("location")).toBe("/")
    expect(res.headers.get("set-cookie")).toEqual(["a=1; Path=/", "b=2; Path=/"])
  })
})
