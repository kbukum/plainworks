// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Grid, Split, Stack } from "./layout"

afterEach(cleanup)

describe("Stack", () => {
  it("lays children out along the chosen axis with a gap and stays accessible", async () => {
    const { container } = render(
      <Stack direction="horizontal" gap="lg" align="center" justify="between">
        <span>one</span>
        <span>two</span>
      </Stack>,
    )
    const stack = container.querySelector('[data-slot="stack"]')
    expect(stack?.className).toContain("flex-row")
    expect(stack?.className).toContain("gap-6")
    expect(stack?.className).toContain("items-center")
    expect(stack?.className).toContain("justify-between")
    await expectNoAxeViolations(container)
  })

  it("defaults to a vertical medium-gap stack", () => {
    const { container } = render(<Stack>content</Stack>)
    const stack = container.querySelector('[data-slot="stack"]')
    expect(stack?.className).toContain("flex-col")
    expect(stack?.className).toContain("gap-4")
  })
})

describe("Grid", () => {
  it("renders a fluid auto-fit track from the minimum column width", async () => {
    const { container } = render(<Grid minColumnWidth="12rem">cells</Grid>)
    const grid = container.querySelector('[data-slot="grid"]') as HTMLElement
    expect(grid.className).toContain("grid")
    expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fit, minmax(min(12rem, 100%), 1fr))")
    await expectNoAxeViolations(container)
  })
})

describe("Split", () => {
  it("renders the side in an aside and the children as the main region", async () => {
    const { container } = render(
      <Split side={<nav aria-label="Sections">side</nav>} sideBasis="20rem">
        <p>main</p>
      </Split>,
    )
    expect(screen.getByRole("complementary")).toBeDefined()
    expect(screen.getByRole("navigation", { name: "Sections" })).toBeDefined()
    const root = container.querySelector('[data-slot="split"]') as HTMLElement
    expect(root.style.getPropertyValue("--split-basis")).toBe("20rem")
    await expectNoAxeViolations(container)
  })

  it("places the side after the main region when sidePlacement is end", () => {
    const { container } = render(
      <Split side={<div>s</div>} sidePlacement="end">
        <div>m</div>
      </Split>,
    )
    const slots = [...container.querySelectorAll("[data-slot]")].map((n) =>
      n.getAttribute("data-slot"),
    )
    expect(slots.indexOf("split-main")).toBeLessThan(slots.indexOf("split-side"))
  })

  it("keeps a caller-provided style alongside the required --split-basis property", () => {
    const { container } = render(
      <Split side={<div>s</div>} sideBasis="18rem" style={{ color: "red" }}>
        <div>m</div>
      </Split>,
    )
    const root = container.querySelector('[data-slot="split"]') as HTMLElement
    expect(root.style.getPropertyValue("--split-basis")).toBe("18rem")
    expect(root.style.color).toBe("red")
  })
})
