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

// One live stream must update BOTH a `@plainworks/state` slot AND the `@plainworks/query` cache
// through the single unified `EventSink` contract. `testkit`'s shared stream transport double lets
// the test push one frame deterministically and assert it lands in both destinations from that one
// stream.

function upsertFrame(id: string, title: string): StreamFrame {
  return { type: "task.upserted", data: JSON.stringify({ id, title }), id }
}

describe("unified event contract", () => {
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

    // The state sink folds id → title into the memory slot.
    await waitFor(async () => {
      expect(await source.get()).toEqual({ "live-1": "Ship the reference app" })
    })

    // The query sink writes the same payload under ["task", id] — one stream, two destinations.
    await waitFor(() => {
      expect(queryClient.getQueryData<TaskEvent["data"]>(["task", "live-1"])).toEqual({
        id: "live-1",
        title: "Ship the reference app",
      })
    })

    unmount()
  })

  it("useLiveTasks reconciles live task updates and cleans up on unmount", async () => {
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

  it("useLiveTasks surfaces source failures in component state and reports to error sink", async () => {
    const baseSource = createLiveTasksSource()
    const errorSource = {
      ...baseSource,
      get: () => Promise.reject(new Error("source read failed")),
      subscribe: () => ({ unsubscribe: () => {} }),
    }
    let reportedError: unknown

    function FailingConsumer(): ReactElement {
      const { tasks, error } = useLiveTasks(errorSource, (err) => {
        reportedError = err
      })
      return (
        <div>
          <div data-testid="tasks">{JSON.stringify(tasks)}</div>
          {error !== undefined && <div data-testid="error">failed</div>}
        </div>
      )
    }

    const { unmount, getByTestId } = render(<FailingConsumer />)
    await waitFor(() => {
      expect(getByTestId("error").textContent).toBe("failed")
      expect(reportedError).toBeInstanceOf(Error)
    })
    unmount()
  })
})
