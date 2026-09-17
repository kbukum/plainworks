import { afterEach, describe, expect, test } from "vitest"
import { ChannelError } from "../../error"
import { resolveGlobalSocketFactory, SOCKET_OPEN, type WebSocketLike } from "./socket"

const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket

afterEach(() => {
  ;(globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket
})

describe("resolveGlobalSocketFactory", () => {
  test("throws a config error when no global WebSocket exists", () => {
    ;(globalThis as { WebSocket?: unknown }).WebSocket = undefined
    expect(() => resolveGlobalSocketFactory()).toThrow(ChannelError)
  })

  test("constructs a socket from the global WebSocket, passing subprotocols", () => {
    const calls: { url: string; protocols?: string | string[] | undefined }[] = []
    class StubSocket implements WebSocketLike {
      readyState = SOCKET_OPEN
      binaryType = "blob"
      onopen = null
      onmessage = null
      onerror = null
      onclose = null
      constructor(url: string, protocols?: string | string[]) {
        calls.push({ url, protocols })
      }
      send(): void {}
      close(): void {}
    }
    ;(globalThis as { WebSocket?: unknown }).WebSocket = StubSocket

    const factory = resolveGlobalSocketFactory()
    const socket = factory("wss://example.test/ws", { headers: {}, protocols: "v1" })

    expect(socket).toBeInstanceOf(StubSocket)
    expect(calls).toEqual([{ url: "wss://example.test/ws", protocols: ["v1"] }])
  })

  test("refuses to silently drop resolved headers the platform constructor cannot attach", () => {
    class StubSocket implements WebSocketLike {
      readyState = SOCKET_OPEN
      binaryType = "blob"
      onopen = null
      onmessage = null
      onerror = null
      onclose = null
      send(): void {}
      close(): void {}
    }
    ;(globalThis as { WebSocket?: unknown }).WebSocket = StubSocket

    const factory = resolveGlobalSocketFactory()
    expect(() => factory("wss://example.test/ws", { headers: { authorization: "cred" } })).toThrow(
      ChannelError,
    )
  })
})
