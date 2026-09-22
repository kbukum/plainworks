// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import { DevtoolsShell } from "./devtools-shell"

const http: SourceId = { kind: "http", instance: "api" }

afterEach(cleanup)

function setup() {
  const session = createDevtoolsSession()
  const source = fakeSource(http, { label: "HTTP api" })
  session.registerSource(source)
  return { session, source }
}

describe("DevtoolsShell", () => {
  it("opens the inspector from the launcher and restores focus on close", async () => {
    const user = userEvent.setup()
    const { session } = setup()
    render(<DevtoolsShell session={session} tickMs={0} />)
    const launcher = screen.getByRole("button", { name: "Open Plainworks inspector" })
    await user.click(launcher)
    expect(screen.getByRole("dialog", { name: "Plainworks inspector" })).toBeTruthy()
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(launcher))
  })

  it("toggles the inspector with the keyboard shortcut", async () => {
    const user = userEvent.setup()
    const { session } = setup()
    render(<DevtoolsShell session={session} tickMs={0} />)
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}")
    expect(screen.getByRole("dialog", { name: "Plainworks inspector" })).toBeTruthy()
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("shows rail indicators and opens the targeted view from the rail", async () => {
    const user = userEvent.setup()
    const { session, source } = setup()
    source.indicate({
      id: "health",
      label: "HTTP",
      value: "2 in flight",
      severity: "info",
      updatedAt: 1_000,
      target: "http",
    })
    render(<DevtoolsShell session={session} tickMs={0} now={() => 1_000} />)
    await user.click(screen.getByRole("button", { name: "HTTP: 2 in flight" }))
    expect(screen.getByRole("tab", { name: "http" }).getAttribute("aria-selected")).toBe("true")
  })

  it("honors the presentation choice", () => {
    const { session } = setup()
    const { unmount } = render(
      <DevtoolsShell session={session} tickMs={0} presentation="launcher" />,
    )
    expect(screen.getByRole("button", { name: "Open Plainworks inspector" })).toBeTruthy()
    unmount()
    const { session: railSession, source } = setup()
    source.indicate({
      id: "health",
      label: "HTTP",
      value: "ok",
      severity: "ok",
      updatedAt: 1,
    })
    render(<DevtoolsShell session={railSession} tickMs={0} presentation="rail" now={() => 1} />)
    expect(screen.queryByRole("button", { name: "Open Plainworks inspector" })).toBeNull()
    expect(screen.getByRole("region", { name: "Diagnostics" })).toBeTruthy()
  })

  it("stops observing after unmount", () => {
    const { session, source } = setup()
    const { unmount } = render(<DevtoolsShell session={session} tickMs={0} />)
    unmount()
    expect(() =>
      source.emit({ kind: "request", label: "GET /a", severity: "ok", at: 1 }),
    ).not.toThrow()
    expect(screen.queryByRole("button", { name: "Open Plainworks inspector" })).toBeNull()
  })

  it("passes axe closed and open", async () => {
    const user = userEvent.setup()
    const { session, source } = setup()
    source.emit({ kind: "request", label: "GET /tasks", severity: "ok", at: 1_000 })
    const { container } = render(<DevtoolsShell session={session} tickMs={0} />)
    await expectNoAxeViolations(container)
    await user.click(screen.getByRole("button", { name: "Open Plainworks inspector" }))
    await expectNoAxeViolations(container)
  })
})
