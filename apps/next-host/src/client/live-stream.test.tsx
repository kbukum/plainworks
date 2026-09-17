// @vitest-environment jsdom

import { createQueryClient } from "@plainworks/query"
import { QueryProvider } from "@plainworks/query/client"
import type { StreamFrame } from "@plainworks/std"
import { fakeStreamTransport } from "@plainworks/testkit"
import { render, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it } from "vitest"
import { LiveChannelProvider, LiveTaskSink, type TaskEvent, useLiveTasks } from "./live-stream"
import { createLiveTasksSource } from "./sources"

// The one live stream must fold each event into BOTH a `@plainworks/state` slot AND the
// `@plainworks/query` cache through the single unified `EventSink` contract. `testkit`'s stream
// transport double pushes frames deterministically so the test can assert both destinations, the
// reconciler's error surface, and unmount teardown.

function upsertFrame(id: string, title: string): StreamFrame {
  return { type: "task.upserted", data: JSON.stringify({ id, title }), id }
}

describe("live stream", () => {
  it("folds one stream event into both the state slot and the query cache", async () => {
    const source = createLiveTasksSource()
    const queryClient = createQueryClient()
    const transport = fakeStreamTransport()

    const tree: ReactElement = (
      <QueryProvider client={queryClient}>
        <LiveChannelProvider options={{ transport: transport.factory }}>
          <LiveTaskSink source={source}>
            <div>ready</div>
          </LiveTaskSink>
        </LiveChannelProvider>
      </QueryProvider>
    )
    const { unmount } = render(tree)

    await waitFor(() => expect(transport.current).toBeDefined())
    transport.current?.open()
    transport.current?.frame(upsertFrame("live-1", "Ship the reference app"))

    await waitFor(async () => {
      expect(await source.get()).toEqual({ "live-1": "Ship the reference app" })
    })
    await waitFor(() => {
      expect(queryClient.getQueryData<TaskEvent["data"]>(["task", "live-1"])).toEqual({
        id: "live-1",
        title: "Ship the reference app",
      })
    })

    unmount()
  })

  it("drops a malformed frame instead of folding it into either sink", async () => {
    const source = createLiveTasksSource()
    const queryClient = createQueryClient()
    const transport = fakeStreamTransport()

    const { unmount } = render(
      <QueryProvider client={queryClient}>
        <LiveChannelProvider options={{ transport: transport.factory }}>
          <LiveTaskSink source={source}>
            <div>ready</div>
          </LiveTaskSink>
        </LiveChannelProvider>
      </QueryProvider>,
    )

    await waitFor(() => expect(transport.current).toBeDefined())
    transport.current?.open()
    // Frames are delivered in order, so once the valid frame lands the malformed one has been
    // processed (and dropped) ahead of it.
    transport.current?.frame({ type: "task.upserted", data: "not json", id: "0" })
    transport.current?.frame(upsertFrame("live-1", "Ship the reference app"))

    await waitFor(() => {
      expect(queryClient.getQueryData(["task", "live-1"])).toBeDefined()
    })
    expect(queryClient.getQueryData(["task", "0"])).toBeUndefined()
    expect(await source.get()).toEqual({ "live-1": "Ship the reference app" })

    unmount()
  })

  it("useLiveTasks reconciles live updates and cleans up on unmount", async () => {
    const source = createLiveTasksSource()

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

  it("useLiveTasks surfaces a source read failure in state and reports it", async () => {
    const baseSource = createLiveTasksSource()
    const errorSource = {
      ...baseSource,
      get: () => Promise.reject(new Error("source read failed")),
      subscribe: () => ({ unsubscribe: () => {} }),
    }
    let reportedError: unknown

    function FailingConsumer(): ReactElement {
      const { error } = useLiveTasks(errorSource, (err) => {
        reportedError = err
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
