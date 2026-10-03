// @vitest-environment jsdom

import { ChannelError, createChannel } from "@plainworks/channel"
import { createEventRouter, protobufDecoder } from "@plainworks/channel/events"
import { createQueryClient } from "@plainworks/query"
import { createLiveQuery } from "@plainworks/query/cache"
import { QueryProvider } from "@plainworks/query/client"
import type { StreamFrame } from "@plainworks/std/seam"
import { flushMicrotasks } from "@plainworks/testkit"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { fakeStreamTransport } from "@plainworks/testkit/fakes"
import { createTestQueryClient } from "@plainworks/testkit/query"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"
import { LIVE_TASKS_SLOT_KEY } from "../../neutral/constants"
import { TaskChangedSchema } from "../../neutral/live/events_pb"
import { createLiveTasksSource } from "../bootstrap"
import { LiveChannelProvider, LiveTaskSink, useLiveTasks } from "./live-stream"

// The remote state source observes the same snapshot the live Query owner fetches.

function upsertFrame(id: string, title: string): StreamFrame {
  return {
    type: TaskChangedSchema.typeName,
    data: JSON.stringify({ id, title }),
    id: "00000000000000000000000000000001:1",
  }
}

describe("live stream", () => {
  it.each(["transport", "frame"] as const)(
    "keeps a terminal %s failure visible without a snapshot refresh action",
    async (kind) => {
      const client = createQueryClient()
      const transport = fakeStreamTransport()
      const snapshot = async () => ({ current: "Snapshot" })
      const { container, unmount, rerender } = render(
        <QueryProvider client={client}>
          <LiveChannelProvider options={{ transport: transport.factory }}>
            <LiveTaskSink snapshot={snapshot}>Live feed</LiveTaskSink>
          </LiveChannelProvider>
        </QueryProvider>,
      )
      await waitFor(() => expect(transport.current).toBeDefined())
      act(() => {
        if (kind === "transport")
          transport.current?.endError(ChannelError.protocol("Sign in.", { status: 401 }))
        else {
          transport.current?.open()
          transport.current?.frame({
            type: "failure",
            data: JSON.stringify({ code: "TOKEN_EXPIRED", message: "Sign in.", retryable: false }),
          })
        }
      })
      expect((await screen.findByRole("alert")).textContent).toContain("Sign in.")
      expect(screen.queryByRole("button", { name: "Refresh live data" })).toBeNull()
      rerender(
        <QueryProvider client={client}>
          <LiveChannelProvider options={{ transport: transport.factory }}>
            <LiveTaskSink snapshot={async () => ({ current: "Replacement" })}>
              Live feed
            </LiveTaskSink>
          </LiveChannelProvider>
        </QueryProvider>,
      )
      expect(screen.getByRole("alert").textContent).toContain("Sign in.")
      expect(screen.queryByRole("button", { name: "Refresh live data" })).toBeNull()
      await expectNoAxeViolations(container)
      unmount()
      transport.assertClosed()
      client.clear()
    },
  )

  it("lets the user explicitly refresh a failed live snapshot", async () => {
    const client = createQueryClient()
    const transport = fakeStreamTransport()
    let reads = 0
    const snapshot = async (): Promise<Record<string, string>> => {
      if (++reads === 1) throw new Error("Snapshot unavailable")
      return { current: "Recovered" }
    }
    const { unmount } = render(
      <QueryProvider client={client}>
        <LiveChannelProvider options={{ transport: transport.factory }}>
          <LiveTaskSink snapshot={snapshot}>Live feed</LiveTaskSink>
        </LiveChannelProvider>
      </QueryProvider>,
    )
    await waitFor(() => expect(transport.current).toBeDefined())
    transport.current?.open()
    transport.current?.frame({
      type: "connected",
      data: '{"epoch":"00000000000000000000000000000001","cursor":"00000000000000000000000000000001:0"}',
    })
    await userEvent.setup().click(await screen.findByRole("button", { name: "Refresh live data" }))
    await waitFor(() =>
      expect(client.getQueryData([LIVE_TASKS_SLOT_KEY])).toEqual({
        current: "Recovered",
      }),
    )
    expect(reads).toBe(2)
    unmount()
    client.clear()
  })

  it("refreshes the real remote cache after local queue overflow", async () => {
    const client = createQueryClient()
    const source = createLiveTasksSource(client)
    const subscription = source.subscribe(() => {})
    let reads = 0
    const live = createLiveQuery(
      client,
      {
        queryKey: [LIVE_TASKS_SLOT_KEY],
        queryFn: async () => ({ current: `Snapshot ${++reads}` }),
      },
      { backoff: { baseMs: 0, maxMs: 0, factor: 1, jitter: "none" } },
    )
    const transport = fakeStreamTransport()
    const channel = createChannel({ transport: transport.factory })
    const router = createEventRouter({
      channel,
      decode: protobufDecoder(TaskChangedSchema),
      sinks: [live],
      capacity: 1,
    })
    channel.connect()
    await flushMicrotasks()
    transport.current?.open()
    transport.current?.frame({
      type: "connected",
      data: '{"epoch":"00000000000000000000000000000001","cursor":"00000000000000000000000000000001:0"}',
    })
    await flushMicrotasks()
    expect(await source.get()).toEqual({ current: "Snapshot 1" })
    for (let sequence = 1; sequence <= 5; sequence++)
      transport.current?.frame({
        ...upsertFrame("live-1", "Not an authoritative snapshot"),
        id: `00000000000000000000000000000001:${sequence}`,
      })
    await flushMicrotasks()
    expect(await source.get()).toEqual({ current: "Snapshot 2" })
    expect(live.status).toBe("fresh")
    expect(reads).toBe(2)
    router.close()
    channel.close()
    subscription.unsubscribe()
    client.clear()
  })

  it("reads the authoritative snapshot through both remote state and the query cache", async () => {
    const queryClient = createTestQueryClient(createQueryClient)
    const source = createLiveTasksSource(queryClient)
    const transport = fakeStreamTransport()
    const snapshot = async () => ({ "live-1": "Ship the reference app" })

    const tree: ReactElement = (
      <QueryProvider client={queryClient}>
        <LiveChannelProvider options={{ transport: transport.factory }}>
          <LiveTaskSink snapshot={snapshot}>
            <div>ready</div>
          </LiveTaskSink>
        </LiveChannelProvider>
      </QueryProvider>
    )
    const { container, unmount } = render(tree)

    await waitFor(() => expect(transport.current).toBeDefined())
    transport.current?.open()
    transport.current?.frame({
      type: "connected",
      data: '{"epoch":"00000000000000000000000000000001","cursor":"00000000000000000000000000000001:0"}',
    })
    transport.current?.frame(upsertFrame("live-1", "Ship the reference app"))

    await waitFor(async () => {
      expect(await source.get()).toEqual({ "live-1": "Ship the reference app" })
    })
    await waitFor(() => {
      expect(queryClient.getQueryData([LIVE_TASKS_SLOT_KEY])).toEqual({
        "live-1": "Ship the reference app",
      })
    })
    await expectNoAxeViolations(container)

    unmount()
  })

  it("drops a malformed frame instead of folding it into either sink", async () => {
    const queryClient = createTestQueryClient(createQueryClient)
    const source = createLiveTasksSource(queryClient)
    const snapshot = async () => ({ "live-1": "Ship the reference app" })
    const transport = fakeStreamTransport()

    const { unmount } = render(
      <QueryProvider client={queryClient}>
        <LiveChannelProvider options={{ transport: transport.factory }}>
          <LiveTaskSink snapshot={snapshot}>
            <div>ready</div>
          </LiveTaskSink>
        </LiveChannelProvider>
      </QueryProvider>,
    )

    await waitFor(() => expect(transport.current).toBeDefined())
    transport.current?.open()
    // Frames are delivered in order, so once the valid frame lands the malformed one has been
    // processed (and dropped) ahead of it.
    transport.current?.frame({ type: TaskChangedSchema.typeName, data: "not json", id: "0" })
    transport.current?.frame(upsertFrame("live-1", "Ship the reference app"))

    await waitFor(() => {
      expect(queryClient.getQueryData([LIVE_TASKS_SLOT_KEY])).toBeDefined()
    })
    expect(queryClient.getQueryData(["task", "0"])).toBeUndefined()
    expect(await source.get()).toEqual({ "live-1": "Ship the reference app" })

    unmount()
  })

  it("useLiveTasks reconciles live updates and cleans up on unmount", async () => {
    const source = createLiveTasksSource(createQueryClient())

    function LiveConsumer(): ReactElement {
      const { tasks } = useLiveTasks(source)
      return <div data-testid="live">{JSON.stringify(tasks)}</div>
    }

    const { unmount, getByTestId } = render(<LiveConsumer />)
    expect(getByTestId("live").textContent).toBe("{}")

    await source.set({ "task-1": "Updated title" })
    await waitFor(() => {
      expect(getByTestId("live").textContent).toContain("Updated title")
    })

    unmount()
    await source.set({ "task-2": "Second title" })
  })

  it("useLiveTasks suppresses state adoption when paused", async () => {
    const source = createLiveTasksSource(createQueryClient())

    function PausedConsumer(): ReactElement {
      const { tasks } = useLiveTasks(source, { paused: true })
      return <div data-testid="live">{JSON.stringify(tasks)}</div>
    }

    const { unmount, getByTestId } = render(<PausedConsumer />)
    expect(getByTestId("live").textContent).toBe("{}")

    await source.set({ "task-1": "Updated title" })
    expect(getByTestId("live").textContent).toBe("{}")

    unmount()
  })

  it("useLiveTasks surfaces a source read failure in state and reports it", async () => {
    const baseSource = createLiveTasksSource(createQueryClient())
    const errorSource = {
      ...baseSource,
      get: () => Promise.reject(new Error("source read failed")),
      subscribe: () => ({ unsubscribe: () => {} }),
    }
    let reportedError: unknown

    function FailingConsumer(): ReactElement {
      const { error } = useLiveTasks(errorSource, {
        onReconcileError: (err) => {
          reportedError = err
        },
      })
      return <div>{error !== undefined && <div data-testid="error">failed</div>}</div>
    }

    const { unmount, getByTestId } = render(<FailingConsumer />)
    await waitFor(() => {
      expect(getByTestId("error").textContent).toBe("failed")
      expect(reportedError).toBeInstanceOf(Error)
    })
    unmount()
  })
})
