// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shadcn/tabs"

afterEach(cleanup)

function Example() {
  return (
    <Tabs defaultValue="overview">
      <TabsList aria-label="Project sections">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">Overview panel</TabsContent>
      <TabsContent value="activity">Activity panel</TabsContent>
    </Tabs>
  )
}

describe("Tabs", () => {
  it("renders a tablist with a selected tab and visible panel", () => {
    render(<Example />)

    expect(screen.getByRole("tablist", { name: "Project sections" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe(
      "false",
    )
    expect(screen.getByRole("tabpanel").textContent).toContain("Overview panel")
  })

  it("moves between tabs with arrow keys", async () => {
    const user = userEvent.setup()
    render(<Example />)

    const overview = screen.getByRole("tab", { name: "Overview" })
    const activity = screen.getByRole("tab", { name: "Activity" })

    await user.click(overview)
    expect(overview).toBe(document.activeElement)
    await user.keyboard("{ArrowRight}")
    expect(activity).toBe(document.activeElement)
  })

  it("switches the visible panel when a tab is clicked", async () => {
    const user = userEvent.setup()
    render(<Example />)

    await user.click(screen.getByRole("tab", { name: "Activity" }))

    expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByRole("tabpanel").textContent).toContain("Activity panel")
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
