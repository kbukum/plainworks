// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession, type DevtoolsClientPort } from "../../session"
import type { DevtoolsStore } from "../../store"
import { createDevtoolsStore } from "../../store"
import { type FakeSource, fakeSource } from "../../testing/fake-source"
import { GenericSourcePanel, panelPropsFor } from "./source-panel"

const http: SourceId = { kind: "http", instance: "api" }

afterEach(cleanup)

interface Harness {
  readonly port: DevtoolsClientPort
  readonly store: DevtoolsStore
  readonly source: FakeSource
}

function setup(): Harness {
  const session = createDevtoolsSession()
  const source = fakeSource(http, {
    label: "HTTP api",
    commands: [{ id: "clear", label: "Clear log", risk: "safe", available: true }],
    runCommand: () => "cleared",
    resolveDetail: (ref) => ({ ref }),
  })
  session.registerSource(source)
  const port = session.connect()
  return { port, store: createDevtoolsStore(port), source }
}

describe("GenericSourcePanel", () => {
  it("renders the source's indicators, commands, and events", () => {
    const harness = setup()
    harness.source.indicate({
      id: "health",
      label: "HTTP",
      value: "2 in flight",
      severity: "info",
      updatedAt: 1_000,
    })
    harness.source.emit({ kind: "request", label: "GET /tasks", severity: "ok", at: 1_000 })
    const props = panelPropsFor(harness.store.getSnapshot(), http, harness.port)
    render(<GenericSourcePanel {...props} />)
    expect(screen.getByText("2 in flight")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Clear log" })).toBeTruthy()
    expect(screen.getByText("GET /tasks")).toBeTruthy()
  })

  it("shows the failure alert when the adapter is broken", () => {
    const harness = setup()
    harness.source.fail(new Error("interceptor detached"))
    const props = panelPropsFor(harness.store.getSnapshot(), http, harness.port)
    render(<GenericSourcePanel {...props} />)
    expect(screen.getByRole("alert").textContent).toContain("interceptor detached")
  })

  it("passes axe", async () => {
    const harness = setup()
    harness.source.emit({ kind: "request", label: "GET /tasks", severity: "ok", at: 1_000 })
    const props = panelPropsFor(harness.store.getSnapshot(), http, harness.port)
    const { container } = render(<GenericSourcePanel {...props} />)
    await expectNoAxeViolations(container)
  })
})
