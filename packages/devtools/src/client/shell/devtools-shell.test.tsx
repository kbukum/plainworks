// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import { DevtoolsShell, type DevtoolsShellProps } from "./devtools-shell"

const http: SourceId = { kind: "http", instance: "api" }
const root = document.documentElement

afterEach(cleanup)

function setup() {
  const session = createDevtoolsSession()
  const source = fakeSource(http, { label: "HTTP api" })
  session.registerSource(source)
  return { session, source }
}

/** A host page beside the shell: a live control proves the app stays usable while inspecting. */
function Host(props: DevtoolsShellProps) {
  const [clicks, setClicks] = useState(0)
  return (
    <>
      <main>
        <button type="button" onClick={() => setClicks((count) => count + 1)}>
          {`Host action ${clicks}`}
        </button>
      </main>
      <DevtoolsShell tickMs={0} {...props} />
    </>
  )
}

function renderHost(props: Partial<DevtoolsShellProps> = {}): ReturnType<typeof render> {
  const { session } = setup()
  return render(<Host session={session} {...props} />)
}

const launcher = (): HTMLElement => screen.getByRole("button", { name: "Inspect" })

describe("DevtoolsShell", () => {
  it("docks a labelled bar with a collapsed inspector toggle", () => {
    renderHost()
    expect(screen.getByRole("region", { name: "Plainworks devtools" })).toBeTruthy()
    expect(launcher().getAttribute("aria-expanded")).toBe("false")
    expect(screen.queryByRole("region", { name: "Plainworks inspector" })).toBeNull()
  })

  it("opens a non-modal inspector that leaves the host usable", async () => {
    const user = userEvent.setup()
    renderHost()
    await user.click(launcher())

    const inspector = screen.getByRole("region", { name: "Plainworks inspector" })
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(launcher().getAttribute("aria-expanded")).toBe("true")
    expect(launcher().getAttribute("aria-controls")).toBe(inspector.id)
    await waitFor(() => expect(inspector.contains(document.activeElement)).toBe(true))

    const main = screen.getByRole("main")
    expect(main.closest("[inert],[aria-hidden='true']")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Host action 0" }))
    expect(screen.getByRole("button", { name: "Host action 1" })).toBeTruthy()
    expect(screen.getByRole("region", { name: "Plainworks inspector" })).toBeTruthy()
  })

  it("closes on Escape inside the inspector and returns focus to the launcher", async () => {
    const user = userEvent.setup()
    renderHost()
    await user.click(launcher())
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("region", { name: "Plainworks inspector" })).toBeNull()
    expect(document.activeElement).toBe(launcher())
  })

  it("closes from its own close button", async () => {
    const user = userEvent.setup()
    renderHost()
    await user.click(launcher())
    await user.click(screen.getByRole("button", { name: "Close inspector" }))
    expect(screen.queryByRole("region", { name: "Plainworks inspector" })).toBeNull()
    expect(document.activeElement).toBe(launcher())
  })

  it("leaves focus in the host when the developer moved there before closing", async () => {
    const user = userEvent.setup()
    renderHost()
    await user.click(launcher())
    const action = screen.getByRole("button", { name: "Host action 0" })
    await user.click(action)
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}")
    expect(screen.queryByRole("region", { name: "Plainworks inspector" })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Host action 1" }))
  })

  it("toggles the inspector with the keyboard shortcut", async () => {
    const user = userEvent.setup()
    renderHost()
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}")
    expect(screen.getByRole("region", { name: "Plainworks inspector" })).toBeTruthy()
    await user.keyboard("{Control>}{Shift>}d{/Shift}{/Control}")
    expect(screen.queryByRole("region", { name: "Plainworks inspector" })).toBeNull()
  })

  it("advertises the shortcut without adding it to the launcher's name", () => {
    renderHost()
    expect(launcher().getAttribute("aria-keyshortcuts")).toBe("Control+Shift+D Meta+Shift+D")
    const { session } = setup()
    cleanup()
    render(<Host session={session} shortcut={null} />)
    expect(launcher().hasAttribute("aria-keyshortcuts")).toBe(false)
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
    render(<Host session={session} now={() => 1_000} />)
    await user.click(screen.getByRole("button", { name: "HTTP: 2 in flight" }))
    expect(screen.getByRole("tab", { name: "http" }).getAttribute("aria-selected")).toBe("true")
  })

  it("publishes the host contract on the document root and clears it on unmount", async () => {
    const user = userEvent.setup()
    const { unmount } = renderHost()
    expect(root.hasAttribute("data-plainworks-devtools-docked")).toBe(true)
    expect(root.hasAttribute("data-plainworks-devtools-reserve")).toBe(true)
    expect(root.hasAttribute("data-plainworks-devtools-panel")).toBe(false)

    await user.click(launcher())
    expect(root.getAttribute("data-plainworks-devtools-panel")).toBe("auto")
    await user.click(launcher())
    expect(root.hasAttribute("data-plainworks-devtools-panel")).toBe(false)

    unmount()
    expect(root.hasAttribute("data-plainworks-devtools-docked")).toBe(false)
    expect(root.hasAttribute("data-plainworks-devtools-reserve")).toBe(false)
  })

  it("adds its reservation on top of the host's own root padding", async () => {
    const user = userEvent.setup()
    root.style.setProperty("padding-block-end", "12px")
    root.style.setProperty("padding-inline-end", "2rem")
    root.style.setProperty("scroll-padding-block-end", "3px")
    try {
      const { unmount } = renderHost()
      // The stylesheet adds the inset to these captured host values instead of replacing them.
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-block-end")).toBe(
        "12px",
      )
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-inline-end")).toBe(
        "32px",
      )
      expect(
        root.style.getPropertyValue("--plainworks-devtools-host-scroll-padding-block-end"),
      ).toBe("3px")
      expect(
        root.style.getPropertyValue("--plainworks-devtools-host-scroll-padding-inline-end"),
      ).toBe("0px")

      // Reopening recaptures from the host alone, never from a previous reservation.
      await user.click(launcher())
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-block-end")).toBe(
        "12px",
      )

      unmount()
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-block-end")).toBe("")
      expect(root.style.getPropertyValue("padding-inline-end")).toBe("2rem")
    } finally {
      root.removeAttribute("style")
    }
  })

  it("captures no host padding when the host owns space reservation", () => {
    root.style.setProperty("padding-block-end", "12px")
    try {
      renderHost({ reserveSpace: false })
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-block-end")).toBe("")
    } finally {
      root.removeAttribute("style")
    }
  })

  it("reports a pinned dock side and lets the host own space reservation", async () => {
    const user = userEvent.setup()
    renderHost({ dock: "bottom", reserveSpace: false })
    expect(root.hasAttribute("data-plainworks-devtools-docked")).toBe(true)
    expect(root.hasAttribute("data-plainworks-devtools-reserve")).toBe(false)
    await user.click(launcher())
    expect(root.getAttribute("data-plainworks-devtools-panel")).toBe("bottom")
  })

  it("scopes its chrome under the package style root", () => {
    renderHost()
    const bar = screen.getByRole("region", { name: "Plainworks devtools" })
    expect(bar.closest("[data-plainworks-devtools]")).not.toBeNull()
    expect(screen.getByRole("main").closest("[data-plainworks-devtools]")).toBeNull()
  })

  it("stops observing after unmount", () => {
    const { session, source } = setup()
    const { unmount } = render(<Host session={session} />)
    unmount()
    expect(() =>
      source.emit({ kind: "request", label: "GET /a", severity: "ok", at: 1 }),
    ).not.toThrow()
    expect(screen.queryByRole("region", { name: "Plainworks devtools" })).toBeNull()
  })

  it("passes axe closed and open", async () => {
    const user = userEvent.setup()
    const { session, source } = setup()
    source.emit({ kind: "request", label: "GET /tasks", severity: "ok", at: 1_000 })
    const { container } = render(<Host session={session} />)
    await expectNoAxeViolations(container)
    await user.click(launcher())
    await expectNoAxeViolations(container)
  })
})
