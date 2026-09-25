import { describe, expect, it } from "vitest"
import { createDevtoolsSeams } from "./seams"

describe("createDevtoolsSeams", () => {
  it("builds identified HTTP and channel instrumentation with an inert interceptor", () => {
    const seams = createDevtoolsSeams()
    expect(typeof seams.http.interceptor).toBe("function")
    expect(seams.http.source.id.kind).toBe("http")
    expect(seams.http.source.id.instance).toBe("api")
    expect(seams.channel.source.id.kind).toBe("channel")
    expect(seams.channel.source.id.instance).toBe("live")
  })

  it("channel.instrument composes the host's status handler rather than replacing it", () => {
    const seams = createDevtoolsSeams()
    const seen: string[] = []
    const decorated = seams.channel.instrument({
      transport: () => ({ open: async () => {} }),
      onStatusChange: (status) => seen.push(status),
    })
    decorated.onStatusChange?.("open")
    expect(seen).toEqual(["open"])
  })
})
