// @vitest-environment jsdom
import { createScopedState } from "@plainworks/state/client"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { createQueryClient } from "../query-client"
import { createRemoteScope } from "./scope"

afterEach(cleanup)

// Acceptance: the `remote` scope drives the unchanged scoped-state consumer surface
// (`createScopedState`) through the query cache — a server-owned scope needs no widening of the
// `Scope`/`StateSource` seam. `createScopedState` is used verbatim; only `scope` is `remote`.
describe("remote scope through the scoped-state surface", () => {
  it("reads and writes a scoped value through the query cache with no surface change", async () => {
    const client = createQueryClient()
    const useCount = createScopedState<number>({
      scope: createRemoteScope({ client }),
      key: "count",
      initial: 0,
    })

    function Counter(): ReactNode {
      const count = useCount()
      const api = useCount.useApi()
      return createElement(
        "button",
        { type: "button", onClick: () => api.set((n) => n + 1) },
        `count: ${count}`,
      )
    }

    render(createElement(useCount.Provider, null, createElement(Counter)))
    expect(screen.getByRole("button", { name: "count: 0" })).toBeDefined()

    const user = userEvent.setup()
    await user.click(screen.getByRole("button"))
    expect(screen.getByRole("button", { name: "count: 1" })).toBeDefined()
    // The write landed in the shared query cache under the namespaced remote key.
    expect(client.getQueryData(["plainworks", "remote", "count"])).toBe(1)
  })

  it("propagates an external cache change back into the surface", async () => {
    const client = createQueryClient()
    const useCount = createScopedState<number>({
      scope: createRemoteScope({ client }),
      key: "count",
      initial: 0,
    })

    function Counter(): ReactNode {
      return createElement("p", null, `count: ${useCount()}`)
    }

    render(createElement(useCount.Provider, null, createElement(Counter)))

    // A change written straight to the cache (e.g. a query refetch) flows through subscribe -> the
    // mirror.
    act(() => {
      client.setQueryData(["plainworks", "remote", "count"], 42)
    })
    await waitFor(() => expect(screen.getByText("count: 42")).toBeDefined())
  })
})
