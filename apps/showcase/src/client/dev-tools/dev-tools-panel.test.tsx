// @vitest-environment jsdom

import { createMockServerHandle } from "@plainworks/demo/server"
import { createHttpClient } from "@plainworks/http"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { DevToolsPanel } from "."

const handle = createMockServerHandle({ seed: 13 })
const httpClient = createHttpClient({ baseUrl: "http://showcase.test" })

beforeAll(() => handle.server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  cleanup()
  handle.server.resetHandlers()
  handle.api.reset()
})
afterAll(() => handle.server.close())

describe("DevToolsPanel", () => {
  it("opens with focus management and renders the live mock request log", async () => {
    const user = userEvent.setup()
    await httpClient.get("/api/tasks")
    render(<DevToolsPanel client={httpClient} refreshIntervalMs={0} />)

    const trigger = screen.getByRole("button", { name: "Mock inspector" })
    await user.click(trigger)

    const panel = await screen.findByRole("dialog", { name: "Mock inspector" })
    expect(within(panel).getByText("/api/tasks")).toBeDefined()
    expect(
      within(within(panel).getByRole("list", { name: "Mock requests" })).getByText("GET"),
    ).toBeDefined()

    await user.click(within(panel).getByRole("button", { name: "Close" }))
    expect(screen.queryByRole("dialog", { name: "Mock inspector" })).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it("drives latency, error simulation, reset, and a real HTTP-client probe", async () => {
    const user = userEvent.setup()
    let time = 100
    render(
      <DevToolsPanel
        client={httpClient}
        refreshIntervalMs={0}
        now={() => {
          time += 7
          return time
        }}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Mock inspector" }))
    const panel = await screen.findByRole("dialog", { name: "Mock inspector" })

    const latency = within(panel).getByRole("spinbutton", { name: "Latency in milliseconds" })
    await user.clear(latency)
    await user.type(latency, "25")
    await user.click(within(panel).getByRole("button", { name: "Apply latency" }))
    await waitFor(() => expect(handle.api.latency.get()).toBe(25))
    await within(panel).findByText("Latency set to 25 ms")

    await user.click(within(panel).getByRole("switch", { name: "Simulate API errors" }))
    await waitFor(() => expect(handle.api.control.isErrorEnabled()).toBe(true))
    await within(panel).findByText("Error simulation enabled")
    await waitFor(() =>
      expect(
        within(panel).getByRole("button", { name: "Send request" }).hasAttribute("disabled"),
      ).toBe(false),
    )
    await user.click(within(panel).getByRole("switch", { name: "Simulate API errors" }))
    await waitFor(() => expect(handle.api.control.isErrorEnabled()).toBe(false))
    await within(panel).findByText("Error simulation disabled")
    await waitFor(() =>
      expect(
        within(panel).getByRole("button", { name: "Send request" }).hasAttribute("disabled"),
      ).toBe(false),
    )

    await user.selectOptions(within(panel).getByRole("combobox", { name: "Request method" }), "GET")
    await user.selectOptions(
      within(panel).getByRole("combobox", { name: "Request endpoint" }),
      "/api/tasks",
    )
    await user.click(within(panel).getByRole("button", { name: "Send request" }))

    const result = await within(panel).findByRole("status", { name: "Request result" })
    expect(result.textContent).toContain("200")
    expect(result.textContent).toContain("7 ms")

    await user.click(within(panel).getByRole("button", { name: "Reset mock data" }))
    await waitFor(() => {
      expect(handle.api.latency.get()).toBe(0)
      expect(handle.api.control.isErrorEnabled()).toBe(false)
    })
    expect(within(panel).getByText("Mock data reset")).toBeDefined()
  })

  it("surfaces control failures instead of showing success", async () => {
    const user = userEvent.setup()
    handle.server.close()
    try {
      render(<DevToolsPanel client={httpClient} refreshIntervalMs={0} />)

      await user.click(screen.getByRole("button", { name: "Mock inspector" }))

      expect((await screen.findByRole("alert")).textContent).toBe(
        "The mock inspector could not reach its control plane.",
      )
    } finally {
      handle.server.listen({ onUnhandledRequest: "error" })
    }
  })

  it("has no detectable accessibility violations", async () => {
    const user = userEvent.setup()
    const { container } = render(<DevToolsPanel client={httpClient} refreshIntervalMs={0} />)
    await user.click(screen.getByRole("button", { name: "Mock inspector" }))
    await screen.findByRole("dialog", { name: "Mock inspector" })

    await expectNoAxeViolations(container)
  })
})
