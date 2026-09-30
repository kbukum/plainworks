// @vitest-environment jsdom

import type { ListFilter } from "@plainworks/std/list"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { type FacetField, FacetPanel, type FacetPanelProps } from "./facet-panel"

afterEach(cleanup)

const FIELDS: readonly FacetField[] = [
  {
    field: "status",
    label: "Status",
    options: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
  },
]

function Harness(props: Partial<FacetPanelProps> & { readonly seen?: ListFilter[][] }) {
  const [filters, setFilters] = useState<readonly ListFilter[]>([])
  return (
    <main>
      <FacetPanel
        fields={FIELDS}
        facets={{ status: { open: 3 } }}
        value={filters}
        onChange={(next) => {
          setFilters(next)
          props.seen?.push([...next])
        }}
        {...props}
      />
    </main>
  )
}

describe("FacetPanel", () => {
  it("groups each field's options with their live counts, zero included", async () => {
    render(<Harness />)
    const group = screen.getByRole("group", { name: "Status" })
    expect(within(group).getByRole("checkbox", { name: "Open, 3" })).toBeDefined()
    expect(within(group).getByRole("checkbox", { name: "Closed, 0" })).toBeDefined()
    expect(screen.getByRole("region", { name: "Filters" })).toBeDefined()
    await expectNoAxeViolations(document.body)
  })

  it("emits one `in` filter per field and drops it when cleared", async () => {
    const seen: ListFilter[][] = []
    const user = userEvent.setup()
    render(<Harness seen={seen} />)
    await user.click(screen.getByRole("checkbox", { name: "Open, 3" }))
    await user.click(screen.getByRole("checkbox", { name: "Closed, 0" }))
    await user.click(screen.getByRole("checkbox", { name: "Open, 3" }))
    await user.click(screen.getByRole("checkbox", { name: "Closed, 0" }))
    expect(seen).toEqual([
      [{ field: "status", op: "in", value: ["open"] }],
      [{ field: "status", op: "in", value: ["open", "closed"] }],
      [{ field: "status", op: "in", value: ["closed"] }],
      [],
    ])
  })

  it("takes translated labels", () => {
    render(
      <Harness labels={{ region: "Filtres", option: (label, count) => `${label} (${count})` }} />,
    )
    expect(screen.getByRole("region", { name: "Filtres" })).toBeDefined()
    expect(screen.getByRole("checkbox", { name: "Open (3)" })).toBeDefined()
  })

  it("splits its fields into two columns by its own width, not the viewport", () => {
    const { container } = render(<Harness />)
    const root = container.querySelector("main > div")
    expect(root?.className).toContain("@container/facets")
    expect(root?.firstElementChild?.className).toContain("@sm/facets:grid-cols-2")
  })
})
