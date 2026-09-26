// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession, type DevtoolsClientPort } from "../../session"
import { createDevtoolsStore, type DevtoolsStore } from "../../store"
import { type FakeSource, fakeSource } from "../../testing/fake-source"
import { DevtoolsInspector } from "./devtools-inspector"
import type { SourcePanelProps } from "./source-panel"

const http: SourceId = { kind: "http", instance: "api" }
const httpSecond: SourceId = { kind: "http", instance: "billing" }
const query: SourceId = { kind: "query", instance: "main" }

afterEach(cleanup)

interface Harness {
  readonly port: DevtoolsClientPort
  readonly store: DevtoolsStore
  readonly sources: readonly FakeSource[]
}

function setup(...sources: FakeSource[]): Harness {
  const session = createDevtoolsSession()
  for (const source of sources) session.registerSource(source)
  const port = session.connect()
  return { port, store: createDevtoolsStore(port), sources }
}

function renderInspector(
  harness: Harness,
  overrides: Partial<Parameters<typeof DevtoolsInspector>[0]> = {},
) {
  const onOpenChange = vi.fn()
  const utils = render(
    <DevtoolsInspector
      open
      onOpenChange={onOpenChange}
      state={harness.store.getSnapshot()}
      store={harness.store}
      port={harness.port}
      {...overrides}
    />,
  )
  return { onOpenChange, ...utils }
}

describe("DevtoolsInspector", () => {
  it("renders nothing while closed", () => {
    const harness = setup(fakeSource(http))
    renderInspector(harness, { open: false })
    expect(screen.queryByRole("region", { name: "Plainworks inspector" })).toBeNull()
  })

  it("opens a named, non-modal region and asks to close on Escape", async () => {
    const user = userEvent.setup()
    const harness = setup(fakeSource(http))
    const { onOpenChange } = renderInspector(harness)
    const region = screen.getByRole("region", { name: "Plainworks inspector" })
    expect(screen.queryByRole("dialog")).toBeNull()
    await waitFor(() => expect(region.contains(document.activeElement)).toBe(true))
    await user.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("docks by the requested side", () => {
    const harness = setup(fakeSource(http))
    renderInspector(harness, { dock: "bottom" })
    expect(
      screen.getByRole("region", { name: "Plainworks inspector" }).getAttribute("data-dock"),
    ).toBe("bottom")
  })

  it("offers overview, timeline, and one tab per source kind", async () => {
    const user = userEvent.setup()
    const harness = setup(fakeSource(http), fakeSource(query))
    renderInspector(harness)
    expect(screen.getByRole("tab", { name: "Overview" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Timeline" })).toBeTruthy()
    await user.click(screen.getByRole("tab", { name: "http" }))
    expect(screen.getByRole("tab", { name: "http" }).getAttribute("aria-selected")).toBe("true")
  })

  it("activates the tab named by the target", () => {
    const harness = setup(fakeSource(http), fakeSource(query))
    renderInspector(harness, { target: "timeline" })
    expect(screen.getByRole("tab", { name: "Timeline" }).getAttribute("aria-selected")).toBe("true")
  })

  it("falls back to Overview when the target names no known view or kind", () => {
    const harness = setup(fakeSource(http))
    renderInspector(harness, { target: "state" })
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true")
  })

  it("keeps the last-used view across close and reopen", async () => {
    const user = userEvent.setup()
    const harness = setup(fakeSource(http))
    const props = {
      onOpenChange: vi.fn(),
      state: harness.store.getSnapshot(),
      store: harness.store,
      port: harness.port,
    }
    const { rerender } = render(<DevtoolsInspector open {...props} />)
    await user.click(screen.getByRole("tab", { name: "Timeline" }))
    rerender(<DevtoolsInspector open={false} {...props} />)
    rerender(<DevtoolsInspector open {...props} />)
    expect(screen.getByRole("tab", { name: "Timeline" }).getAttribute("aria-selected")).toBe("true")
  })

  it("drops a pending confirmation when switching to another instance", async () => {
    const user = userEvent.setup()
    const commands = [
      { id: "reset", label: "Reset data", risk: "destructive", available: true },
    ] as const
    const runCommand = vi.fn(() => "done")
    const harness = setup(
      fakeSource(http, { label: "HTTP api", commands, runCommand }),
      fakeSource(httpSecond, { label: "HTTP billing", commands, runCommand }),
    )
    renderInspector(harness, { target: "http" })
    await user.click(screen.getByRole("button", { name: "Reset data" }))
    expect(screen.getByRole("group", { name: "Confirm Reset data" })).toBeTruthy()
    await user.selectOptions(screen.getByRole("combobox", { name: "Instance" }), "HTTP billing")
    expect(screen.queryByRole("group", { name: "Confirm Reset data" })).toBeNull()
    expect(runCommand).not.toHaveBeenCalled()
  })

  it("offers an instance picker when a kind has several instances", async () => {
    const user = userEvent.setup()
    const first = fakeSource(http, { label: "HTTP api" })
    const second = fakeSource(httpSecond, { label: "HTTP billing" })
    const harness = setup(first, second)
    second.emit({ kind: "request", label: "POST /pay", severity: "ok", at: 1_000 })
    renderInspector(harness, { target: "http" })
    const picker = screen.getByRole("combobox", { name: "Instance" })
    expect(screen.getByRole<HTMLOptionElement>("option", { name: "HTTP api" }).selected).toBe(true)
    await user.selectOptions(picker, "HTTP billing")
    expect(screen.getByText("POST /pay")).toBeTruthy()
  })

  it("renders a custom renderer for its kind and the generic panel for the rest", async () => {
    const user = userEvent.setup()
    const harness = setup(fakeSource(http), fakeSource(query, { label: "Query main" }))
    harness.sources[1]?.emit({ kind: "fetch", label: "tasks", severity: "ok", at: 1_000 })
    const custom = vi.fn((props: SourcePanelProps) => (
      <div>Custom query panel with {props.events.length} events</div>
    ))
    renderInspector(harness, { renderers: { query: custom } })
    await user.click(screen.getByRole("tab", { name: "query" }))
    const customPanel = screen.getByText("Custom query panel with 1 events")
    // Host-rendered panels sit in the slot the package stylesheet leaves to the host's styles.
    expect(customPanel.closest("[data-plainworks-devtools-slot]")).not.toBeNull()
    await user.click(screen.getByRole("tab", { name: "http" }))
    const generic = screen.getByText("No events recorded yet")
    expect(generic.closest("[data-plainworks-devtools-slot]")).toBeNull()
  })

  it("passes axe while open", async () => {
    const harness = setup(fakeSource(http))
    harness.sources[0]?.emit({ kind: "request", label: "GET /tasks", severity: "ok", at: 1_000 })
    const { container } = renderInspector(harness)
    await expectNoAxeViolations(container)
  })
})
