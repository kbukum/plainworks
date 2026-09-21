import { describe, expect, it, vi } from "vitest"
import { createMemoryBridge } from "./memory"

describe("createMemoryBridge", () => {
  it("delivers host frames to client subscribers and vice versa", () => {
    const bridge = createMemoryBridge()
    const onClient = vi.fn()
    const onHost = vi.fn()
    bridge.client.subscribe(onClient)
    bridge.host.subscribe(onHost)

    bridge.host.post({ a: 1 })
    bridge.client.post({ b: 2 })

    expect(onClient).toHaveBeenCalledWith({ a: 1 })
    expect(onHost).toHaveBeenCalledWith({ b: 2 })
  })

  it("does not echo a frame back to the posting side", () => {
    const bridge = createMemoryBridge()
    const onHost = vi.fn()
    bridge.host.subscribe(onHost)
    bridge.host.post({ a: 1 })
    expect(onHost).not.toHaveBeenCalled()
  })

  it("stops delivering after unsubscribe", () => {
    const bridge = createMemoryBridge()
    const onClient = vi.fn()
    const subscription = bridge.client.subscribe(onClient)
    subscription.unsubscribe()
    bridge.host.post({ a: 1 })
    expect(onClient).not.toHaveBeenCalled()
  })

  it("isolates a throwing listener from other listeners", () => {
    const bridge = createMemoryBridge()
    const good = vi.fn()
    bridge.client.subscribe(() => {
      throw new Error("boom")
    })
    bridge.client.subscribe(good)
    expect(() => bridge.host.post({ a: 1 })).not.toThrow()
    expect(good).toHaveBeenCalledWith({ a: 1 })
  })

  it("drops all listeners on dispose", () => {
    const bridge = createMemoryBridge()
    const onClient = vi.fn()
    bridge.client.subscribe(onClient)
    bridge.dispose()
    bridge.host.post({ a: 1 })
    expect(onClient).not.toHaveBeenCalled()
  })
})
