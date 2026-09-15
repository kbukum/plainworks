import { describe, expect, it, vi } from "vitest"
import { respondWithInternalError } from "./internal-error"

describe("respondWithInternalError", () => {
  it("returns a generic plain-text response without exposing exception details", () => {
    const setHeader = vi.fn()
    const end = vi.fn()
    const response = {
      headersSent: false,
      statusCode: 200,
      setHeader,
      end,
    }

    respondWithInternalError(response)

    expect(response.statusCode).toBe(500)
    expect(setHeader).toHaveBeenCalledWith("content-type", "text/plain; charset=utf-8")
    expect(end).toHaveBeenCalledWith("Internal Server Error")
  })

  it("ends with the generic response when headers were already sent", () => {
    const setHeader = vi.fn()
    const end = vi.fn()
    const response = {
      headersSent: true,
      statusCode: 200,
      setHeader,
      end,
    }

    respondWithInternalError(response)

    expect(response.statusCode).toBe(200)
    expect(setHeader).not.toHaveBeenCalled()
    expect(end).toHaveBeenCalledWith("Internal Server Error")
  })
})
