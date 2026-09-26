// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession, type DevtoolsClientPort } from "../../session"
import { createDevtoolsStore, type DevtoolsStore } from "../../store"
import { type FakeSource, fakeSource } from "../../testing/fake-source"
import { TimelineView } from "./timeline-view"

const http: SourceId = { kind: "http", instance: "api" }
const state: SourceId = { kind: "state", instance: "cart" }

afterEach(cleanup)

interface Harness {
  readonly port: DevtoolsClientPort
  readonly store: DevtoolsStore
  readonly httpSource: FakeSource
  readonly stateSource: FakeSource
}

function setup(): Harness {
  const session = createDevtoolsSession()
  const httpSource = fakeSource(http, { label: "HTTP api" })
  const stateSource = fakeSource(state, { label: "Cart store" })
  session.registerSource(httpSource)
  session.registerSource(stateSource)
  const port = session.connect()
  return { port, store: createDevtoolsStore(port), httpSource, stateSource }
}

function renderTimeline({ port, store }: Harness) {
  return render(<TimelineView state={store.getSnapshot()} store={store} port={port} />)
}

function emit(
  source: FakeSource,
  kind: string,
  label: string,
  severity: "ok" | "info" | "warn" | "error",
  at: number,
): void {
  source.emit({ kind, label, severity, at })
}

describe("TimelineView", () => {
  it("lists events across sources, newest first", () => {
    const harness = setup()
    emit(harness.httpSource, "request", "GET /tasks", "ok", 1_000)
    emit(harness.stateSource, "change", "item added", "info", 2_000)
    renderTimeline(harness)
    const rows = screen.getAllByRole("listitem")
    expect(rows[0]?.textContent).toContain("item added")
    expect(rows[1]?.textContent).toContain("GET /tasks")
  })

  it("filters by severity", async () => {
    const user = userEvent.setup()
    const harness = setup()
    emit(harness.httpSource, "request", "GET /ok", "ok", 1_000)
    emit(harness.httpSource, "request", "GET /broken", "error", 2_000)
    renderTimeline(harness)
    await user.selectOptions(screen.getByRole("combobox", { name: "Severity" }), "Error")
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("GET /broken")).toBeTruthy()
  })

  it("filters by source", async () => {
    const user = userEvent.setup()
    const harness = setup()
    emit(harness.httpSource, "request", "GET /tasks", "ok", 1_000)
    emit(harness.stateSource, "change", "item added", "info", 2_000)
    renderTimeline(harness)
    await user.selectOptions(screen.getByRole("combobox", { name: "Source" }), "Cart store")
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("item added")).toBeTruthy()
  })

  it("filters by kind substring", async () => {
    const user = userEvent.setup()
    const harness = setup()
    emit(harness.httpSource, "request", "GET /tasks", "ok", 1_000)
    emit(harness.stateSource, "change", "item added", "info", 2_000)
    renderTimeline(harness)
    await user.type(screen.getByRole("searchbox", { name: "Kind" }), "req")
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByText("GET /tasks")).toBeTruthy()
  })

  it("pauses collection without losing it, and resumes from the host", () => {
    const harness = setup()
    const { rerender } = renderTimeline(harness)
    emit(harness.httpSource, "request", "before pause", "ok", 1_000)
    rerender(
      <TimelineView
        state={harness.store.getSnapshot()}
        store={harness.store}
        port={harness.port}
      />,
    )

    harness.store.pause()
    emit(harness.httpSource, "request", "during pause", "ok", 2_000)
    rerender(
      <TimelineView
        state={harness.store.getSnapshot()}
        store={harness.store}
        port={harness.port}
      />,
    )
    expect(screen.queryByText("during pause")).toBeNull()
    const resume = screen.getByRole("button", { name: "Resume" })
    expect(resume).toBeTruthy()
    expect(resume.getAttribute("aria-pressed")).toBeNull()

    harness.store.resume()
    rerender(
      <TimelineView
        state={harness.store.getSnapshot()}
        store={harness.store}
        port={harness.port}
      />,
    )
    expect(screen.getByText("during pause")).toBeTruthy()
  })

  it("clears the visible history", () => {
    const harness = setup()
    const { rerender } = renderTimeline(harness)
    emit(harness.httpSource, "request", "GET /tasks", "ok", 1_000)
    rerender(
      <TimelineView
        state={harness.store.getSnapshot()}
        store={harness.store}
        port={harness.port}
      />,
    )
    expect(screen.getByText("GET /tasks")).toBeTruthy()

    harness.store.clear()
    rerender(
      <TimelineView
        state={harness.store.getSnapshot()}
        store={harness.store}
        port={harness.port}
      />,
    )
    expect(screen.queryByText("GET /tasks")).toBeNull()
    expect(screen.getByText("No events recorded yet")).toBeTruthy()
  })

  it("reports filtered and dropped counts", () => {
    const harness = setup()
    for (let index = 0; index < 5; index += 1) {
      emit(harness.httpSource, "request", `r${index}`, "ok", index)
    }
    renderTimeline(harness)
    const status = screen.getByRole("status")
    expect(status.textContent).toContain("5 events")
  })

  it("passes axe with events and toolbar", async () => {
    const harness = setup()
    emit(harness.httpSource, "request", "GET /tasks", "warn", 1_000)
    const { container } = renderTimeline(harness)
    await expectNoAxeViolations(container)
  })
})
