// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import {
  createDevtoolsSession,
  createDevtoolsStore,
  type DevtoolsClientPort,
} from "@plainworks/devtools"
import { panelPropsFor } from "@plainworks/devtools/client"
import { createHttpClient, type HttpClient } from "@plainworks/http"
import { createMockControlClient, type MockControlClient } from "@plainworks/mocks"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactElement, StrictMode, useEffect, useState, useSyncExternalStore } from "react"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { MockPanel } from "./mock-panel"
import { createMockSource, MOCK_SOURCE_ID } from "./mock-source"

const handle = createMockServerHandle({ seed: 34 })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

function controlOf(client: HttpClient): MockControlClient {
  return createMockControlClient({ client })
}

function makeClient(): HttpClient {
  return createHttpClient({ baseUrl: "http://showcase.test" })
}

/** Subscribe to the live session store and feed the panel its derived props, like the shell does. */
function Harness({ port }: { readonly port: DevtoolsClientPort }): ReactElement {
  const [store] = useState(() => createDevtoolsStore(port))
  useEffect(() => () => store.dispose(), [store])
  const state = useSyncExternalStore(
    (onChange) => store.subscribe(onChange).unsubscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  return <MockPanel {...panelPropsFor(state, MOCK_SOURCE_ID, port)} />
}

function setup(client: HttpClient) {
  const session = createDevtoolsSession()
  session.registerSource(
    createMockSource({ control: controlOf(client), client, pollIntervalMs: 0, now: () => 1_000 }),
  )
  const port = session.connect()
  return { session, port }
}

describe("MockPanel", () => {
  it("can run commands after StrictMode replays its effects", async () => {
    const { session, port } = setup(makeClient())
    try {
      render(
        <StrictMode>
          <MockPanel
            source={{ id: MOCK_SOURCE_ID, label: "Demo backend", commands: [] }}
            events={[]}
            indicators={[]}
            failure={undefined}
            port={port}
          />
        </StrictMode>,
      )
      await userEvent.setup().click(screen.getByRole("switch", { name: "Simulate API errors" }))
      expect((await screen.findByRole("status")).textContent).toBe("Error simulation enabled")
    } finally {
      session.dispose()
    }
  })

  it("drives the error gate, latency, and a confirmed reset through the port", async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const { session, port } = setup(client)
    try {
      render(<Harness port={port} />)

      const errorSwitch = await screen.findByRole("switch", { name: "Simulate API errors" })
      await user.click(errorSwitch)
      await waitFor(async () => {
        const state = (await client.get("/mock/state")) as { data: { globalError: boolean } }
        expect(state.data.globalError).toBe(true)
      })

      const latency = screen.getByRole("spinbutton", { name: "Latency in milliseconds" })
      await user.clear(latency)
      await user.type(latency, "40")
      await user.click(screen.getByRole("button", { name: "Apply latency" }))
      await waitFor(async () => {
        const state = (await client.get("/mock/state")) as { data: { globalDelay: number } }
        expect(state.data.globalDelay).toBe(40)
      })

      await user.click(screen.getByRole("button", { name: "Reset mock data" }))
      const confirm = await screen.findByRole("alertdialog")
      await user.click(within(confirm).getByRole("button", { name: "Reset" }))
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
      expect((await screen.findByRole("status")).textContent).toBe("Mock data reset")
      await waitFor(async () => {
        const state = (await client.get("/mock/state")) as { data: { globalError: boolean } }
        expect(state.data.globalError).toBe(false)
      })
    } finally {
      session.dispose()
    }
  })

  it("ignores an empty latency draft instead of applying zero", async () => {
    const user = userEvent.setup()
    const client = makeClient()
    await controlOf(client).setLatency(120)
    const { session, port } = setup(client)
    try {
      render(<Harness port={port} />)
      const latency = screen.getByRole("spinbutton", { name: "Latency in milliseconds" })
      await waitFor(() => expect((latency as HTMLInputElement).value).toBe("120"))
      await user.clear(latency)
      await user.click(screen.getByRole("button", { name: "Apply latency" }))
      await user.type(latency, "{Enter}")
      const state = (await client.get("/mock/state")) as { data: { globalDelay: number } }
      expect(state.data.globalDelay).toBe(120)
    } finally {
      session.dispose()
    }
  })

  it("seeds its controls from the backend's structured state, not the rail labels", async () => {
    const client = makeClient()
    await controlOf(client).setLatency(120)
    await controlOf(client).setError(true)
    const { session, port } = setup(client)
    try {
      render(<Harness port={port} />)

      const errorSwitch = await screen.findByRole("switch", { name: "Simulate API errors" })
      await waitFor(() => expect(errorSwitch.getAttribute("aria-checked")).toBe("true"))
      const latency = screen.getByRole("spinbutton", { name: "Latency in milliseconds" })
      await waitFor(() => expect((latency as HTMLInputElement).value).toBe("120"))
    } finally {
      session.dispose()
    }
  })

  it("sends an allowlisted read probe and shows its outcome", async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const { session, port } = setup(client)
    try {
      render(<Harness port={port} />)
      await screen.findByRole("switch", { name: "Simulate API errors" })
      await user.click(screen.getByRole("button", { name: "Send probe" }))
      await screen.findByText(/status/i)
    } finally {
      session.dispose()
    }
  })

  it("lists recorded backend requests and has no accessibility violations", async () => {
    const user = userEvent.setup()
    const client = makeClient()
    await client.get("/api/tasks")
    const { session, port } = setup(client)
    try {
      const { container } = render(<Harness port={port} />)
      await screen.findByRole("switch", { name: "Simulate API errors" })
      await waitFor(() =>
        expect(
          within(screen.getByRole("list", { name: "Mock requests" })).getAllByText(/GET/).length,
        ).toBeGreaterThan(0),
      )
      await expectNoAxeViolations(container)
      await user.click(screen.getByRole("button", { name: "Clear request log" }))
      await screen.findByText("Request log cleared")
      expect(screen.queryByRole("list", { name: "Mock requests" })).toBeNull()
      expect(screen.getByText("No mock requests yet.")).toBeDefined()
    } finally {
      session.dispose()
    }
  })
})
