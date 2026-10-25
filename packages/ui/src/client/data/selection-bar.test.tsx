// @vitest-environment jsdom

import { expectNoAxeViolations, installLayoutApis } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { SELECTION_BAR_CLEARANCE, SelectionBar } from "./selection-bar"

beforeAll(installLayoutApis)
afterEach(cleanup)

const ITEMS = [
  { id: "m1", name: "llama-3" },
  { id: "m2", name: "qwen-2" },
]

describe("SelectionBar", () => {
  it("shows each pick with its marker, a named remove button and the actions", async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <SelectionBar
        label="Models to compare"
        items={ITEMS}
        summary="2 of 8 models"
        onRemove={onRemove}
        onClear={() => undefined}
        actions={<button type="button">Compare</button>}
      />,
    )
    const bar = screen.getByRole("region", { name: "Models to compare" })
    expect(within(bar).getByText("2 of 8 models")).toBeDefined()
    const markers = bar.querySelectorAll('[data-slot="item-marker"]')
    expect([...markers].map((marker) => marker.textContent)).toEqual(["Allama-3", "Bqwen-2"])
    await user.click(within(bar).getByRole("button", { name: "Remove qwen-2" }))
    expect(onRemove).toHaveBeenCalledWith("m2")
    expect(within(bar).getByRole("button", { name: "Compare" })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("clears every pick", async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(
      <SelectionBar
        label="Picks"
        items={ITEMS}
        summary="2"
        onRemove={() => undefined}
        onClear={onClear}
      />,
    )
    await user.click(screen.getByRole("button", { name: "Clear" }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it("hides when empty but keeps announcing the summary", () => {
    render(
      <SelectionBar
        label="Picks"
        items={[]}
        summary="No models"
        onRemove={() => undefined}
        onClear={() => undefined}
      />,
    )
    expect(screen.queryByRole("region", { name: "Picks" })).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("No models")
  })

  it("announces the summary politely", () => {
    render(
      <SelectionBar
        label="Picks"
        items={ITEMS}
        summary="2 of 8"
        onRemove={() => undefined}
        onClear={() => undefined}
      />,
    )
    expect(screen.getByRole("status").textContent).toBe("2 of 8")
  })

  it("reserves its height and offset at the foot of the page so focus never hides under it", () => {
    const resized: (() => void)[] = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized.push(callback)
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    let height = 48
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height)
    const root = document.documentElement
    const props = {
      label: "Picks",
      summary: "2",
      onRemove: () => undefined,
      onClear: () => undefined,
    }
    const { rerender, unmount } = render(<SelectionBar {...props} items={ITEMS} />)
    const bar = screen.getByRole("region", { name: "Picks" })
    bar.style.bottom = "16px"
    height = 96
    for (const callback of resized) callback()
    expect(root.style.getPropertyValue(SELECTION_BAR_CLEARANCE)).toBe("112px")
    rerender(<SelectionBar {...props} items={[]} />)
    expect(root.style.getPropertyValue(SELECTION_BAR_CLEARANCE)).toBe("")
    rerender(<SelectionBar {...props} items={ITEMS} />)
    expect(root.style.getPropertyValue(SELECTION_BAR_CLEARANCE)).not.toBe("")
    unmount()
    expect(root.style.getPropertyValue(SELECTION_BAR_CLEARANCE)).toBe("")
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
})
