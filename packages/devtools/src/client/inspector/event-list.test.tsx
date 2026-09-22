// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import type { RetentionEntry } from "../../retention"
import { createDevtoolsSession } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import { EventList } from "./event-list"

const http: SourceId = { kind: "http", instance: "api" }

afterEach(cleanup)

function entry(
  seq: number,
  kind: string,
  label: string,
  at: number,
  detail?: string,
): RetentionEntry {
  return {
    id: http,
    seq,
    event: {
      kind,
      label,
      severity: seq % 2 === 0 ? "warn" : "ok",
      at,
      ...(detail === undefined ? {} : { detail }),
    },
  }
}

function setup(resolveDetail?: (ref: string) => unknown) {
  const session = createDevtoolsSession()
  session.registerSource(
    fakeSource(http, {
      label: "HTTP api",
      ...(resolveDetail === undefined ? {} : { resolveDetail }),
    }),
  )
  return { session, port: session.connect() }
}

describe("EventList", () => {
  it("renders entries newest first with time, severity, kind, and label", () => {
    const { port } = setup()
    render(
      <EventList
        sources={[{ id: http, label: "HTTP api", commands: [] }]}
        entries={[
          entry(1, "request", "GET /tasks", Date.UTC(2026, 0, 1, 10, 0, 1)),
          entry(2, "retry", "retry GET /tasks", Date.UTC(2026, 0, 1, 10, 0, 2)),
        ]}
        port={port}
        emptyLabel="No events"
      />,
    )
    const rows = screen.getAllByRole("listitem")
    expect(rows[0]?.textContent).toContain("retry GET /tasks")
    expect(rows[1]?.textContent).toContain("GET /tasks")
    expect(rows[0]?.textContent).toContain("10:00:02")
    expect(screen.getByText("warn")).toBeTruthy()
    expect(screen.getAllByText("HTTP api")).toHaveLength(2)
  })

  it("shows the empty label when there is nothing to list", () => {
    const { port } = setup()
    render(
      <EventList
        sources={[{ id: http, label: "HTTP api", commands: [] }]}
        entries={[]}
        port={port}
        emptyLabel="No events match"
      />,
    )
    expect(screen.getByText("No events match")).toBeTruthy()
  })

  it("loads detail on demand for an entry that advertises it", async () => {
    const user = userEvent.setup()
    const { port } = setup((ref) => ({ ref }))
    render(
      <EventList
        sources={[{ id: http, label: "HTTP api", commands: [] }]}
        entries={[entry(1, "request", "GET /tasks", 1_000, "req-9")]}
        port={port}
        emptyLabel="No events"
      />,
    )
    await user.click(screen.getByRole("button", { name: /Details for GET \/tasks/ }))
    expect(await screen.findByText('"req-9"')).toBeTruthy()
  })

  it("offers no detail affordance for an entry without a detail token", () => {
    const { port } = setup()
    render(
      <EventList
        sources={[{ id: http, label: "HTTP api", commands: [] }]}
        entries={[entry(1, "request", "GET /a", 1_000)]}
        port={port}
        emptyLabel="No events"
      />,
    )
    expect(screen.queryByRole("button", { name: /Details/ })).toBeNull()
  })

  it("passes axe with rows and an expanded detail", async () => {
    const user = userEvent.setup()
    const { port } = setup(() => ({ ok: true }))
    const { container } = render(
      <EventList
        sources={[{ id: http, label: "HTTP api", commands: [] }]}
        entries={[
          entry(1, "request", "GET /tasks", 1_000, "r1"),
          entry(2, "request", "POST /tasks", 2_000),
        ]}
        port={port}
        emptyLabel="No events"
      />,
    )
    await user.click(screen.getByRole("button", { name: /Details for GET \/tasks/ }))
    await screen.findByText("true")
    await expectNoAxeViolations(container)
  })
})
