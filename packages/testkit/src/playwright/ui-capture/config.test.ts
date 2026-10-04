import { describe, expect, it } from "vitest"
import { uiCaptureHostPort } from "./config"
import { UiCaptureError } from "./errors"

describe("capture and exploration ownership", () => {
  it("assigns separate ports to capture, base comparison, and exploration", () => {
    expect(uiCaptureHostPort({ warmPort: 5190 }, "capture")).toBe(5190)
    expect(uiCaptureHostPort({ warmPort: 5190 }, "explore")).toBe(5192)
    expect(uiCaptureHostPort({ warmPort: 5190, explorePort: 6200 }, "explore")).toBe(6200)
  })

  it.each([5190, 5191, 0, -1, 65_536, 1.5])(
    "rejects overlapping or invalid exploration port %s",
    (explorePort) => {
      expect(() => uiCaptureHostPort({ warmPort: 5190, explorePort }, "explore")).toThrow(
        UiCaptureError,
      )
    },
  )

  it("rejects default exploration overflow and invalid warm ports", () => {
    expect(() => uiCaptureHostPort({ warmPort: 65_535 }, "explore")).toThrow(UiCaptureError)
    expect(() => uiCaptureHostPort({ warmPort: 0 }, "capture")).toThrow(UiCaptureError)
  })
})
