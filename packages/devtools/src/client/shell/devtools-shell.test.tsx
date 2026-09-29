// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { SourceId } from "../../protocol"
import { createDevtoolsSession } from "../../session"
import { fakeSource } from "../../testing/fake-source"
import type { DevtoolsLayout } from "../dock/layout"
import { DEVTOOLS_LAYOUT_KEY } from "../dock/layout-source"
import { DevtoolsShell, type DevtoolsShellProps } from "./devtools-shell"

const http: SourceId = { kind: "http", instance: "api" }
const root = document.documentElement

// A desktop-sized viewport that fits a side dock; tests of the narrow fallback flip it.
let wide = installMatchMedia(true)
// jsdom has no pointer capture, which every target browser has; record each capture instead.
let captured: { readonly element: Element; readonly pointerId: number }[] = []
beforeEach(() => {
  wide = installMatchMedia(true)
  captured = []
  HTMLElement.prototype.setPointerCapture = function (this: HTMLElement, pointerId: number) {
    captured.push({ element: this, pointerId })
  }
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture")
})

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
  return render(<Host session={session} layoutSource={fakeStateSource()} {...props} />)
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
    render(<Host session={session} layoutSource={fakeStateSource()} shortcut={null} />)
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
    render(<Host session={session} layoutSource={fakeStateSource()} clock={{ now: () => 1_000 }} />)
    await user.click(screen.getByRole("button", { name: "HTTP: 2 in flight" }))
    expect(screen.getByRole("tab", { name: "http" }).getAttribute("aria-selected")).toBe("true")
  })

  it("publishes the host contract on the document root and clears it on unmount", async () => {
    const user = userEvent.setup()
    const { unmount } = renderHost()
    expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("bottom")
    expect(root.hasAttribute("data-plainworks-devtools-reserve")).toBe(true)
    expect(root.hasAttribute("data-plainworks-devtools-panel")).toBe(false)

    await user.click(launcher())
    expect(root.hasAttribute("data-plainworks-devtools-panel")).toBe(true)
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("422px")
    await user.click(launcher())
    expect(root.hasAttribute("data-plainworks-devtools-panel")).toBe(false)

    unmount()
    expect(root.hasAttribute("data-plainworks-devtools-docked")).toBe(false)
    expect(root.hasAttribute("data-plainworks-devtools-reserve")).toBe(false)
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("")
  })

  it("adds its reservation on top of the host's own root padding", async () => {
    const user = userEvent.setup()
    root.style.setProperty("padding-bottom", "12px")
    root.style.setProperty("padding-right", "2rem")
    root.style.setProperty("scroll-padding-bottom", "3px")
    try {
      const { unmount } = renderHost()
      // The stylesheet adds the inset to these captured host values instead of replacing them.
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-bottom")).toBe("12px")
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-right")).toBe("32px")
      expect(root.style.getPropertyValue("--plainworks-devtools-host-scroll-padding-bottom")).toBe(
        "3px",
      )
      expect(root.style.getPropertyValue("--plainworks-devtools-host-scroll-padding-left")).toBe(
        "0px",
      )

      // Reopening recaptures from the host alone, never from a previous reservation.
      await user.click(launcher())
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-bottom")).toBe("12px")

      unmount()
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-bottom")).toBe("")
      expect(root.style.getPropertyValue("padding-right")).toBe("2rem")
    } finally {
      root.removeAttribute("style")
    }
  })

  it("captures no host padding when the host owns space reservation", () => {
    root.style.setProperty("padding-bottom", "12px")
    try {
      renderHost({ reserveSpace: false })
      expect(root.style.getPropertyValue("--plainworks-devtools-host-padding-bottom")).toBe("")
    } finally {
      root.removeAttribute("style")
    }
  })

  it("reports the dock side and lets the host own space reservation", async () => {
    const user = userEvent.setup()
    renderHost({ defaultDock: "right", reserveSpace: false })
    expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("right")
    expect(root.hasAttribute("data-plainworks-devtools-reserve")).toBe(false)
    await user.click(launcher())
    expect(root.hasAttribute("data-plainworks-devtools-panel")).toBe(true)
  })

  it("scopes its chrome under the package style root", () => {
    renderHost()
    const bar = screen.getByRole("region", { name: "Plainworks devtools" })
    expect(bar.closest("[data-plainworks-devtools]")).not.toBeNull()
    expect(screen.getByRole("main").closest("[data-plainworks-devtools]")).toBeNull()
  })

  it("stops observing after unmount", () => {
    const { session, source } = setup()
    const { unmount } = render(<Host session={session} layoutSource={fakeStateSource()} />)
    unmount()
    expect(() =>
      source.emit({ kind: "request", label: "GET /a", severity: "ok", at: 1 }),
    ).not.toThrow()
    expect(screen.queryByRole("region", { name: "Plainworks devtools" })).toBeNull()
  })

  it("passes axe closed and open", async () => {
    // Open, the inspector adds the side picker and the resize handle.
    const user = userEvent.setup()
    const { session, source } = setup()
    source.emit({ kind: "request", label: "GET /tasks", severity: "ok", at: 1_000 })
    const { container } = render(<Host session={session} layoutSource={fakeStateSource()} />)
    await expectNoAxeViolations(container)
    await user.click(launcher())
    await expectNoAxeViolations(container)
  })
})

describe("DevtoolsShell dock", () => {
  const bar = (): HTMLElement => screen.getByRole("region", { name: "Plainworks devtools" })
  const inspector = (): HTMLElement => screen.getByRole("region", { name: "Plainworks inspector" })
  const handle = (): HTMLElement => screen.getByRole("separator", { name: "Resize inspector" })
  const sideButton = (side: string): HTMLElement =>
    screen.getByRole("button", { name: `Dock to ${side}` })

  function renderDocked(
    layoutSource = fakeStateSource<DevtoolsLayout>(),
    props: Partial<DevtoolsShellProps> = {},
  ) {
    const utils = renderHost({ layoutSource, ...props })
    return { layoutSource, ...utils }
  }

  it("docks the bar and the panel at the bottom by default", async () => {
    const user = userEvent.setup()
    renderDocked()
    expect(bar().getAttribute("data-dock")).toBe("bottom")
    await user.click(launcher())
    expect(inspector().getAttribute("data-dock")).toBe("bottom")
    expect(sideButton("bottom").getAttribute("aria-pressed")).toBe("true")
  })

  it("moves the bar, the panel, and the reservation to the side the user picks", async () => {
    const user = userEvent.setup()
    const { layoutSource } = renderDocked()
    await user.click(launcher())
    for (const side of ["left", "right", "bottom"] as const) {
      await user.click(sideButton(side))
      expect(sideButton(side).getAttribute("aria-pressed")).toBe("true")
      expect(bar().getAttribute("data-dock")).toBe(side)
      expect(inspector().getAttribute("data-dock")).toBe(side)
      expect(root.getAttribute("data-plainworks-devtools-docked")).toBe(side)
      expect(layoutSource.current).toMatchObject({ side })
    }
    // Moving the panel keeps the inspector open and focus on the picker.
    expect(document.activeElement).toBe(sideButton("bottom"))
  })

  it("restores the persisted side on the next mount, over the host's default", async () => {
    const layoutSource = fakeStateSource<DevtoolsLayout>({ initial: { side: "left" } })
    renderDocked(layoutSource, { defaultDock: "right" })
    await waitFor(() => expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("left"))
  })

  it("starts on the host's default side when nothing is persisted", () => {
    renderDocked(fakeStateSource(), { defaultDock: "right" })
    expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("right")
  })

  it("falls back to the bottom on a narrow viewport and offers no side picker", async () => {
    const user = userEvent.setup()
    wide = installMatchMedia(false)
    renderDocked(fakeStateSource(), { defaultDock: "right" })
    expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("bottom")
    await user.click(launcher())
    expect(screen.queryByRole("group", { name: "Dock side" })).toBeNull()
    act(() => wide.setMatches(true))
    expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("right")
    expect(screen.getByRole("group", { name: "Dock side" })).toBeTruthy()
  })

  it("resizes the panel from the keyboard as a window splitter", async () => {
    const user = userEvent.setup()
    const { layoutSource } = renderDocked()
    await user.click(launcher())
    expect(handle().getAttribute("aria-orientation")).toBe("horizontal")
    expect(handle().getAttribute("aria-controls")).toBe(inspector().id)
    expect(handle().getAttribute("aria-valuenow")).toBe("422")
    expect(handle().getAttribute("aria-valuemin")).toBe("192")
    expect(handle().getAttribute("aria-valuemax")).toBe("484")

    handle().focus()
    await user.keyboard("{ArrowUp}")
    expect(handle().getAttribute("aria-valuenow")).toBe("438")
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("438px")
    expect(layoutSource.current).toEqual({ side: "bottom", blockSize: 438 })
    await user.keyboard("{Home}")
    expect(handle().getAttribute("aria-valuenow")).toBe("192")
    await user.keyboard("{End}")
    expect(handle().getAttribute("aria-valuenow")).toBe("484")
  })

  it("resizes a side panel along its width", async () => {
    const user = userEvent.setup()
    const { layoutSource } = renderDocked(fakeStateSource(), { defaultDock: "right" })
    await user.click(launcher())
    expect(handle().getAttribute("aria-orientation")).toBe("vertical")
    expect(handle().getAttribute("aria-valuenow")).toBe("369")
    handle().focus()
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}")
    expect(handle().getAttribute("aria-valuenow")).toBe("433")
    expect(layoutSource.current).toEqual({ side: "right", inlineSize: 433 })
  })

  it("resizes by dragging and persists the size once the drag ends", async () => {
    const user = userEvent.setup()
    const { layoutSource } = renderDocked()
    await user.click(launcher())
    await user.pointer([
      { keys: "[MouseLeft>]", target: handle(), coords: { clientX: 500, clientY: 300 } },
      { coords: { clientX: 500, clientY: 250 } },
    ])
    expect(handle().getAttribute("aria-valuenow")).toBe("472")
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("472px")
    expect(layoutSource.current).toBeUndefined()
    await user.pointer({ keys: "[/MouseLeft]" })
    expect(layoutSource.current).toEqual({ side: "bottom", blockSize: 472 })
  })

  it("restores the committed size when the browser cancels a drag", async () => {
    const user = userEvent.setup()
    const { layoutSource } = renderDocked()
    await user.click(launcher())
    await user.pointer([
      { keys: "[MouseLeft>]", target: handle(), coords: { clientX: 500, clientY: 300 } },
      { coords: { clientX: 500, clientY: 250 } },
    ])
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("472px")
    act(() => {
      window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1 }))
    })
    expect(handle().getAttribute("aria-valuenow")).toBe("422")
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("422px")
    expect(layoutSource.current).toBeUndefined()
  })

  it("captures the dragging pointer, and cancels the drag when capture is lost", async () => {
    const user = userEvent.setup()
    const { layoutSource } = renderDocked()
    await user.click(launcher())
    await user.pointer([
      { keys: "[MouseLeft>]", target: handle(), coords: { clientX: 500, clientY: 300 } },
      { coords: { clientX: 500, clientY: 250 } },
    ])
    expect(captured).toEqual([{ element: handle(), pointerId: 1 }])
    act(() => {
      handle().dispatchEvent(
        new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }),
      )
    })
    expect(handle().getAttribute("data-dragging")).toBeNull()
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("422px")
    expect(layoutSource.current).toBeUndefined()
  })

  it("drops a drag's preview when the inspector closes mid-drag", async () => {
    const user = userEvent.setup()
    const { layoutSource } = renderDocked()
    await user.click(launcher())
    await user.pointer([
      { keys: "[MouseLeft>]", target: handle(), coords: { clientX: 500, clientY: 300 } },
      { coords: { clientX: 500, clientY: 250 } },
    ])
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("472px")
    handle().focus()
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("separator", { name: "Resize inspector" })).toBeNull()
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("422px")
    await user.pointer({ keys: "[/MouseLeft]" })
    await user.click(launcher())
    expect(handle().getAttribute("aria-valuenow")).toBe("422")
    expect(root.style.getPropertyValue("--plainworks-devtools-panel-size")).toBe("422px")
    expect(layoutSource.current).toBeUndefined()
  })

  it("keeps the size of each axis when switching sides", async () => {
    const user = userEvent.setup()
    renderDocked(fakeStateSource({ initial: { side: "bottom", blockSize: 300, inlineSize: 500 } }))
    await user.click(launcher())
    await waitFor(() => expect(handle().getAttribute("aria-valuenow")).toBe("300"))
    await user.click(sideButton("left"))
    expect(handle().getAttribute("aria-valuenow")).toBe("500")
  })

  it("follows a layout changed elsewhere, such as another tab", async () => {
    const layoutSource = fakeStateSource<DevtoolsLayout>()
    renderDocked(layoutSource)
    await act(() => layoutSource.set({ side: "left" }))
    await waitFor(() => expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("left"))
  })

  it("returns to the host's default when the layout is cleared elsewhere", async () => {
    const layoutSource = fakeStateSource<DevtoolsLayout>({ initial: { side: "left" } })
    renderDocked(layoutSource, { defaultDock: "right" })
    await waitFor(() => expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("left"))
    await act(() => layoutSource.remove())
    await waitFor(() => expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("right"))
  })

  it("says so when the saved layout cannot be read, and uses the default", async () => {
    const user = userEvent.setup()
    renderDocked(fakeStateSource({ getError: new Error("Corrupt layout") }), {
      defaultDock: "left",
    })
    await user.click(launcher())
    expect((await screen.findByRole("status")).textContent).toContain("Saved layout unreadable")
    expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("left")
  })

  it("says so when the layout cannot be saved, and keeps the choice for this page", async () => {
    const user = userEvent.setup()
    renderDocked(fakeStateSource({ setError: new Error("Storage is full") }))
    await user.click(launcher())
    await user.click(sideButton("left"))
    expect(root.getAttribute("data-plainworks-devtools-docked")).toBe("left")
    expect((await screen.findByRole("status")).textContent).toContain("Layout not saved")
  })

  it("persists to the browser's local storage by default", async () => {
    const user = userEvent.setup()
    try {
      const { session } = setup()
      render(<Host session={session} />)
      await user.click(launcher())
      await user.click(sideButton("left"))
      await waitFor(() =>
        expect(JSON.parse(localStorage.getItem(DEVTOOLS_LAYOUT_KEY) ?? "null")).toEqual({
          side: "left",
        }),
      )
    } finally {
      localStorage.clear()
    }
  })

  it("passes axe docked on every side", async () => {
    const user = userEvent.setup()
    const { container } = renderDocked()
    await user.click(launcher())
    for (const side of ["bottom", "left", "right"] as const) {
      await user.click(sideButton(side))
      await expectNoAxeViolations(container)
    }
  })
})
