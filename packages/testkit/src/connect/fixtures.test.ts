import { describe, expect, test } from "vitest"
import { countRequest, countResponse, echoRequest, echoResponse } from "./fixtures"

describe("connect fixtures", () => {
  test("echoRequest/echoResponse build typed Echo messages carrying the message", () => {
    expect(echoRequest("hi").message).toBe("hi")
    expect(echoResponse("yo").message).toBe("yo")
  })

  test("countRequest/countResponse build typed Count messages carrying the number", () => {
    expect(countRequest(3).count).toBe(3)
    expect(countResponse(7).value).toBe(7)
  })
})
