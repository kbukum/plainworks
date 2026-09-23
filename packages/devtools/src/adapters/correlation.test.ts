import { describe, expect, it } from "vitest"
import { createCorrelator, outcomeSeverity } from "./correlation"

describe("createCorrelator", () => {
  it("hands out monotonic, prefixed, unique ids for one exchange each", () => {
    const correlator = createCorrelator("http")
    expect(correlator.next()).toBe("http-1")
    expect(correlator.next()).toBe("http-2")
    expect(correlator.next()).toBe("http-3")
  })

  it("keeps separate correlators independent", () => {
    const http = createCorrelator("http")
    const rpc = createCorrelator("rpc")
    http.next()
    expect(rpc.next()).toBe("rpc-1")
  })
})

describe("outcomeSeverity", () => {
  it("maps each outcome to a stable timeline severity", () => {
    expect(outcomeSeverity("ok")).toBe("ok")
    expect(outcomeSeverity("error")).toBe("error")
    expect(outcomeSeverity("timeout")).toBe("warn")
    expect(outcomeSeverity("canceled")).toBe("warn")
  })
})
