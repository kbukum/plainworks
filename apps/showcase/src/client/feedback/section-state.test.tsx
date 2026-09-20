// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SectionState } from "./section-state"

afterEach(cleanup)

const LABELS = {
  loadingLabel: "Loading orders",
  errorTitle: "Orders are unavailable",
} as const

describe("SectionState", () => {
  it("announces a labelled loading region while pending", async () => {
    const { container } = render(
      <SectionState pending {...LABELS}>
        <p>rows</p>
      </SectionState>,
    )
    const status = screen.getByRole("status", { name: "Loading orders" })
    expect(status).toBeDefined()
    expect(screen.queryByText("rows")).toBeNull()
    await expectNoAxeViolations(container)
  })

  it("surfaces a danger callout on error", async () => {
    const { container } = render(
      <SectionState pending={false} error {...LABELS} errorBody="Try again shortly.">
        <p>rows</p>
      </SectionState>,
    )
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Orders are unavailable")
    expect(alert.textContent).toContain("Try again shortly.")
    expect(screen.queryByText("rows")).toBeNull()
    await expectNoAxeViolations(container)
  })

  it("shows the empty state when there is nothing to render", async () => {
    render(
      <SectionState
        pending={false}
        isEmpty
        {...LABELS}
        empty={{ title: "No orders yet", body: "New orders will appear here." }}
      >
        <p>rows</p>
      </SectionState>,
    )
    expect(screen.getByText("No orders yet")).toBeDefined()
    expect(screen.getByText("New orders will appear here.")).toBeDefined()
    expect(screen.queryByText("rows")).toBeNull()
  })

  it("renders its children once resolved with content", () => {
    render(
      <SectionState pending={false} {...LABELS}>
        <p>rows</p>
      </SectionState>,
    )
    expect(screen.getByText("rows")).toBeDefined()
    expect(screen.queryByRole("status")).toBeNull()
  })
})
