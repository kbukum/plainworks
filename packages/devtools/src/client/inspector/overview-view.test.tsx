// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession } from "../../session"
import { createDevtoolsStore, type DevtoolsStoreState } from "../../store"
import { fakeSource } from "../../testing/fake-source"
import { OverviewView } from "./overview-view"

const http: SourceId = { kind: "http", instance: "api" }
const query: SourceId = { kind: "query", instance: "main" }

afterEach(cleanup)

function stateWith(
  register: (session: ReturnType<typeof createDevtoolsSession>) => void,
): DevtoolsStoreState {
  const session = createDevtoolsSession()
  register(session)
  const port = session.connect()
  return createDevtoolsStore(port).getSnapshot()
}

describe("OverviewView", () => {
  it("shows the empty state when no sources are registered", () => {
    render(<OverviewView state={stateWith(() => {})} />)
    expect(screen.getByText(/No sources registered/)).toBeTruthy()
  })

  it("lists every source with its kind, instance, and status", () => {
    const state = stateWith((session) => {
      session.registerSource(fakeSource(http, { label: "HTTP api" }))
      session.registerSource(
        fakeSource(query, {
          label: "Query main",
          commands: [
            { id: "invalidate", label: "Invalidate all", risk: "mutating", available: true },
          ],
        }),
      )
    })
    render(<OverviewView state={state} />)
    expect(screen.getByText("HTTP api")).toBeTruthy()
    expect(screen.getByText("Query main")).toBeTruthy()
    expect(screen.getAllByText(/http · api|query · main/)).toHaveLength(2)
    expect(screen.getByText(/1 command/)).toBeTruthy()
  })

  it("surfaces adapter failures as alerts without hiding other sources", () => {
    const state = stateWith((session) => {
      const broken = fakeSource(http, { label: "HTTP api" })
      session.registerSource(broken)
      session.registerSource(fakeSource(query, { label: "Query main" }))
      broken.fail(new Error("interceptor detached"))
    })
    render(<OverviewView state={state} />)
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("HTTP api")
    expect(alert.textContent).toContain("interceptor detached")
    expect(screen.getByText("Query main")).toBeTruthy()
  })

  it("reports dropped events when retention overflowed", () => {
    const session = createDevtoolsSession({ retention: { perSource: 2, aggregate: 2 } })
    const source = fakeSource(http, { label: "HTTP api" })
    session.registerSource(source)
    for (let index = 0; index < 4; index += 1) {
      source.emit({ kind: "request", label: `r${index}`, severity: "ok", at: index })
    }
    const state = createDevtoolsStore(session.connect()).getSnapshot()
    render(<OverviewView state={state} />)
    expect(screen.getByText(/retention is bounded/)).toBeTruthy()
    expect(screen.getByText(/0 commands · 2 events dropped/)).toBeTruthy()
  })

  it("passes axe with sources and a failure", async () => {
    const state = stateWith((session) => {
      const broken = fakeSource(http, { label: "HTTP api" })
      session.registerSource(broken)
      session.registerSource(fakeSource(query, { label: "Query main" }))
      broken.fail(new Error("boom"))
    })
    const { container } = render(<OverviewView state={state} />)
    await expectNoAxeViolations(container)
  })
})
