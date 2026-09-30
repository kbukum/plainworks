import type { Channel } from "@plainworks/channel"
import type { StreamFrame } from "@plainworks/std/seam"
import { deferred } from "@plainworks/testkit"
import { QueryClient } from "@tanstack/query-core"
import { describe, expect, it, vi } from "vitest"
import type { Source } from "../source"
import { fakeSource } from "../testing/fake-source"
import { type DevtoolsInspector, launchDevtools } from "./launch-devtools"

interface Mounted {
  readonly sources: readonly Source[]
  disposed: boolean
}

function recordingInspector(): {
  readonly inspector: DevtoolsInspector
  readonly mounts: Mounted[]
} {
  const mounts: Mounted[] = []
  const inspector: DevtoolsInspector = ({ sources }) => {
    const mounted: Mounted = { sources, disposed: false }
    mounts.push(mounted)
    return {
      dispose: () => {
        mounted.disposed = true
      },
    }
  }
  return { inspector, mounts }
}

type FakeChannel = Channel & { readonly listening: () => boolean }

function fakeChannel(): FakeChannel {
  let listener: ((frame: StreamFrame) => void) | undefined
  const channel = {
    status: "idle",
    lastEventId: undefined,
    connect: () => {},
    close: () => {},
    on: () => ({ unsubscribe: () => {} }),
    onAny: (next: (frame: StreamFrame) => void) => {
      listener = next
      return { unsubscribe: () => (listener = undefined) }
    },
    listening: () => listener !== undefined,
  }
  return channel as unknown as FakeChannel
}

function kindsOf(sources: readonly Source[]): string[] {
  return sources.map((source) => source.id.kind)
}

describe("launchDevtools", () => {
  it("builds only the startup seams the host asks for", () => {
    const report = vi.fn()
    const bare = launchDevtools({ report })
    expect(bare.http).toBeUndefined()
    expect(bare.channel).toBeUndefined()

    const full = launchDevtools({
      report,
      http: { instance: "api" },
      channel: { instance: "live" },
    })
    expect(typeof full.http?.interceptor).toBe("function")
    expect(typeof full.channel?.instrument).toBe("function")
    expect(report).not.toHaveBeenCalled()
  })

  it("mounts the startup, query, and host sources once the inspector loads", async () => {
    const launcher = launchDevtools({
      report: vi.fn(),
      http: { instance: "api" },
      channel: { instance: "live" },
    })
    const { inspector, mounts } = recordingInspector()
    const loaded = deferred<DevtoolsInspector>()

    const teardown = launcher.mount({
      load: () => loaded.promise,
      query: { client: new QueryClient(), instance: "app" },
      sources: [fakeSource({ kind: "mock", instance: "demo" })],
    })
    expect(mounts).toHaveLength(0)

    loaded.resolve(inspector)
    await vi.waitFor(() => expect(mounts).toHaveLength(1))
    expect(kindsOf(mounts[0]?.sources ?? [])).toEqual(["http", "channel", "query", "mock"])

    teardown()
    expect(mounts[0]?.disposed).toBe(true)
  })

  it("observes the live channel and releases it on teardown", async () => {
    const launcher = launchDevtools({ report: vi.fn(), channel: { instance: "live" } })
    const { inspector, mounts } = recordingInspector()
    const channel = fakeChannel()

    const teardown = launcher.mount({ load: async () => inspector, channel })
    expect(channel.listening()).toBe(true)
    await vi.waitFor(() => expect(mounts).toHaveLength(1))

    teardown()
    expect(channel.listening()).toBe(false)
    expect(mounts[0]?.disposed).toBe(true)
  })

  it("keeps the inspector's receiver so a this-bound dispose tears down cleanly", async () => {
    const launcher = launchDevtools({ report: vi.fn() })
    class Session {
      mounted = false
      torn = false
      dispose(): void {
        this.torn = true
      }
    }
    const session = new Session()
    const inspector: DevtoolsInspector = () => {
      session.mounted = true
      return session
    }

    const teardown = launcher.mount({ load: async () => inspector })
    await vi.waitFor(() => expect(session.mounted).toBe(true))

    expect(() => teardown()).not.toThrow()
    expect(session.torn).toBe(true)
  })

  it("never mounts when torn down before the inspector loads", async () => {
    const launcher = launchDevtools({ report: vi.fn(), channel: { instance: "live" } })
    const { inspector, mounts } = recordingInspector()
    const loaded = deferred<DevtoolsInspector>()
    const channel = fakeChannel()

    const teardown = launcher.mount({ load: () => loaded.promise, channel })
    teardown()
    expect(channel.listening()).toBe(false)

    loaded.resolve(inspector)
    await loaded.promise
    await Promise.resolve()
    expect(mounts).toHaveLength(0)
  })

  it("reports a load failure and leaves the app running", async () => {
    const report = vi.fn()
    const launcher = launchDevtools({ report, channel: { instance: "live" } })
    const cause = new Error("chunk failed")
    const channel = fakeChannel()

    const teardown = launcher.mount({ load: () => Promise.reject(cause), channel })
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1))
    expect(report).toHaveBeenCalledWith("Development inspector failed to mount.", cause)
    expect(channel.listening()).toBe(false)
    expect(() => teardown()).not.toThrow()
  })

  it("reports a loader that throws synchronously and releases what it observed", async () => {
    const report = vi.fn()
    const launcher = launchDevtools({ report, channel: { instance: "live" } })
    const cause = new Error("import failed")
    const channel = fakeChannel()

    const teardown = launcher.mount({
      load: () => {
        throw cause
      },
      channel,
    })
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith("Development inspector failed to mount.", cause),
    )
    expect(channel.listening()).toBe(false)
    expect(() => teardown()).not.toThrow()
  })

  it("reports a mount failure and releases what it observed", async () => {
    const report = vi.fn()
    const launcher = launchDevtools({ report, channel: { instance: "live" } })
    const cause = new Error("no document")
    const channel = fakeChannel()

    launcher.mount({
      load: async () => () => {
        throw cause
      },
      channel,
    })
    await vi.waitFor(() =>
      expect(report).toHaveBeenCalledWith("Development inspector failed to mount.", cause),
    )
    expect(channel.listening()).toBe(false)
  })

  it("reports a startup failure and goes inert", async () => {
    const report = vi.fn()
    const launcher = launchDevtools({ report, http: { instance: "api", detailCapacity: 0 } })

    expect(report).toHaveBeenCalledWith(
      "Development inspector failed to start; continuing without it.",
      expect.any(Error),
    )
    expect(launcher.http).toBeUndefined()
    const load = vi.fn(async () => recordingInspector().inspector)
    launcher.mount({ load })()
    await Promise.resolve()
    expect(load).not.toHaveBeenCalled()
  })

  it("makes teardown idempotent", async () => {
    const launcher = launchDevtools({ report: vi.fn() })
    const { inspector, mounts } = recordingInspector()
    const teardown = launcher.mount({ load: async () => inspector })
    await vi.waitFor(() => expect(mounts).toHaveLength(1))
    teardown()
    teardown()
    expect(mounts[0]?.disposed).toBe(true)
  })
})
