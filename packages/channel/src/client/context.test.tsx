// @vitest-environment jsdom Client tests opt into jsdom per file; the package default stays `node`
//   so the server-safe `.` entry can never lean on DOM globals unnoticed.
import { act, cleanup, render, renderHook, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import axe from "axe-core"
import { type ReactNode, StrictMode } from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import type { ChannelOptions } from "../lifecycle/channel"
import type { ChannelFrame } from "../transport"
import { fakeTransport } from "../transport/fake-transport"
import { createChannelContext } from "./context"

afterEach(cleanup)

function withTransport(overrides: Partial<ChannelOptions> = {}) {
  const transport = fakeTransport()
  const options: ChannelOptions = { transport: transport.factory, ...overrides }
  return { transport, options }
}

describe("createChannelContext", () => {
  test("connects on mount, exposes live status, and closes on unmount", async () => {
    const { transport, options } = withTransport()
    const { ChannelProvider, useChannelStatus } = createChannelContext()

    function StatusLabel(): ReactNode {
      return <output>{useChannelStatus()}</output>
    }

    const view = render(
      <ChannelProvider options={options}>
        <StatusLabel />
      </ChannelProvider>,
    )
    expect(screen.getByRole("status").textContent).toBe("connecting")

    await act(async () => {
      await Promise.resolve()
      transport.current?.open()
    })
    expect(screen.getByRole("status").textContent).toBe("open")

    view.unmount()
    expect(transport.current?.aborted).toBe(true)
  })

  test("useChannelEvent delivers matching frames and unsubscribes on unmount", async () => {
    const { transport, options } = withTransport()
    const { ChannelProvider, useChannelEvent } = createChannelContext()
    const received: ChannelFrame[] = []

    function Listener(): ReactNode {
      useChannelEvent("tick", (frame) => received.push(frame))
      return null
    }

    const view = render(
      <ChannelProvider options={options}>
        <Listener />
      </ChannelProvider>,
    )
    await act(async () => {
      await Promise.resolve()
      transport.current?.open()
      transport.current?.frame({ type: "tick", data: "a" })
      transport.current?.frame({ type: "other", data: "b" })
    })

    expect(received).toEqual([{ type: "tick", data: "a" }])

    view.unmount()
    // A frame after unmount must not reach the (torn-down) listener.
    transport.current?.frame({ type: "tick", data: "late" })
    expect(received).toHaveLength(1)
  })

  test("useAnyChannelEvent delivers every frame regardless of type", async () => {
    const { transport, options } = withTransport()
    const { ChannelProvider, useAnyChannelEvent } = createChannelContext()
    const types: string[] = []

    function Listener(): ReactNode {
      useAnyChannelEvent((frame) => types.push(frame.type))
      return null
    }

    const view = render(
      <ChannelProvider options={options}>
        <Listener />
      </ChannelProvider>,
    )
    await act(async () => {
      await Promise.resolve()
      transport.current?.open()
      transport.current?.frame({ type: "a", data: "1" })
      transport.current?.frame({ type: "b", data: "2" })
    })

    expect(types).toEqual(["a", "b"])
    view.unmount()
  })

  test("does not auto-connect when disabled", () => {
    const { transport, options } = withTransport()
    const { ChannelProvider, useChannel } = createChannelContext()
    const seen = vi.fn()

    function Probe(): ReactNode {
      seen(useChannel().status)
      return null
    }

    render(
      <ChannelProvider options={options} autoConnect={false}>
        <Probe />
      </ChannelProvider>,
    )
    expect(transport.current).toBeUndefined()
    expect(seen).toHaveBeenCalledWith("idle")
  })

  test("connects imperatively when autoConnect is disabled and tears down a mid-life listener", async () => {
    const { transport, options } = withTransport()
    const { ChannelProvider, useChannel, useChannelEvent } = createChannelContext()
    const received: string[] = []

    function Controls(): ReactNode {
      const channel = useChannel()
      return (
        <button type="button" onClick={() => channel.connect()}>
          connect
        </button>
      )
    }
    function Listener(): ReactNode {
      useChannelEvent("tick", (frame) => received.push(frame.data))
      return null
    }
    function Tree({ withListener }: { withListener: boolean }): ReactNode {
      return (
        <ChannelProvider options={options} autoConnect={false}>
          <Controls />
          {withListener ? <Listener /> : null}
        </ChannelProvider>
      )
    }

    const view = render(<Tree withListener={true} />)
    expect(transport.current).toBeUndefined()

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "connect" }))
    await act(async () => {
      await Promise.resolve()
      transport.current?.open()
    })
    transport.current?.frame({ type: "tick", data: "x" })
    expect(received).toEqual(["x"])

    // Unmount the listener while the Provider (and channel) stay mounted → live unsubscribe.
    view.rerender(<Tree withListener={false} />)
    transport.current?.frame({ type: "tick", data: "late" })
    expect(received).toEqual(["x"])

    view.unmount()
  })

  test("an autoConnect true→false transition rebuilds the channel and resyncs status to idle", async () => {
    const { transport, options } = withTransport()
    const { ChannelProvider, useChannelStatus } = createChannelContext()

    function StatusLabel(): ReactNode {
      return <output>{useChannelStatus()}</output>
    }
    function Tree({ autoConnect }: { autoConnect: boolean }): ReactNode {
      return (
        <ChannelProvider options={options} autoConnect={autoConnect}>
          <StatusLabel />
        </ChannelProvider>
      )
    }

    const view = render(<Tree autoConnect={true} />)
    await act(async () => {
      await Promise.resolve()
      transport.current?.open()
    })
    expect(screen.getByRole("status").textContent).toBe("open")

    view.rerender(<Tree autoConnect={false} />)
    // Effect cleanup closed the previous channel; the rebuilt one must read idle, not stale closed.
    expect(screen.getByRole("status").textContent).toBe("idle")
    view.unmount()
  })

  test("an empty-id cursor reset survives a rebuild instead of restoring the seed", async () => {
    const { transport, options } = withTransport({ lastEventId: "seed-1" })
    const { ChannelProvider } = createChannelContext()

    function Tree({ autoConnect }: { autoConnect: boolean }): ReactNode {
      return (
        <ChannelProvider options={options} autoConnect={autoConnect}>
          {null}
        </ChannelProvider>
      )
    }

    const view = render(<Tree autoConnect={true} />)
    await act(async () => {
      await Promise.resolve()
      transport.current?.open()
    })
    expect(transport.current?.context.lastEventId).toBe("seed-1")

    // The server resets the cursor (SSE empty id), then the provider rebuilds the channel.
    transport.current?.context.onId?.("")
    view.rerender(<Tree autoConnect={false} />)
    view.rerender(<Tree autoConnect={true} />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(transport.current?.context.lastEventId).toBeUndefined()
    view.unmount()
  })

  test("survives a StrictMode mount/unmount/mount cycle and still connects", async () => {
    const { transport, options } = withTransport()
    const { ChannelProvider, useChannelStatus } = createChannelContext()

    function StatusLabel(): ReactNode {
      return <output>{useChannelStatus()}</output>
    }

    render(
      <StrictMode>
        <ChannelProvider options={options}>
          <StatusLabel />
        </ChannelProvider>
      </StrictMode>,
    )
    // StrictMode ran mount → unmount → mount; the first channel was closed and a fresh one is
    // connecting (a terminally-closed channel would leave status stuck and never open).
    expect(screen.getByRole("status").textContent).toBe("connecting")

    await act(async () => {
      await Promise.resolve()
      transport.current?.open()
    })
    expect(screen.getByRole("status").textContent).toBe("open")
  })

  test("rendered provider tree has no axe accessibility violations", async () => {
    const { options } = withTransport()
    const { ChannelProvider, useChannelStatus } = createChannelContext()

    function StatusLabel(): ReactNode {
      return <output>{useChannelStatus()}</output>
    }

    const { container } = render(
      <ChannelProvider options={options}>
        <StatusLabel />
      </ChannelProvider>,
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })

  test("a hook used outside its Provider throws a config error", () => {
    const { useChannel } = createChannelContext()
    expect(() => renderHook(() => useChannel())).toThrow(/within its ChannelProvider/)
  })
})
