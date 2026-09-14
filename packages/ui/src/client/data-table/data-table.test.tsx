// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DataTableColumn, DataTableSort } from "./columns"
import { DataTable } from "./data-table"

afterEach(cleanup)

interface Person {
  readonly id: string
  readonly name: string
  readonly role: string
}

const people: readonly Person[] = [
  { id: "1", name: "Ada Lovelace", role: "Engineer" },
  { id: "2", name: "Alan Turing", role: "Researcher" },
]

const columns: readonly DataTableColumn<Person>[] = [
  { id: "name", header: "Name", cell: (row) => row.name, sortable: true },
  { id: "role", header: "Role", cell: (row) => row.role, align: "end" },
]

const getRowId = (row: Person): string => row.id

describe("DataTable", () => {
  it("renders a semantic, accessible table of the projected rows", async () => {
    const { container } = render(
      <DataTable columns={columns} rows={people} getRowId={getRowId} caption="Team" />,
    )

    const table = screen.getByRole("table", { name: "Team" })
    expect(within(table).getAllByRole("row")).toHaveLength(3)
    expect(screen.getByRole("cell", { name: "Ada Lovelace" })).toBeDefined()
    expect(screen.getByRole("columnheader", { name: /Role/ })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("shows the empty state with injected labels when there are no rows", async () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={getRowId}
        labels={{ emptyTitle: "Nobody here", emptyDescription: "Invite a teammate to begin." }}
      />,
    )

    expect(screen.getByText("Nobody here")).toBeDefined()
    expect(screen.getByText("Invite a teammate to begin.")).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("renders skeleton rows and marks the table busy while loading", async () => {
    const { container } = render(
      <DataTable columns={columns} rows={people} getRowId={getRowId} loading loadingRowCount={4} />,
    )

    const table = screen.getByRole("table")
    expect(table.getAttribute("aria-busy")).toBe("true")
    expect(screen.getByRole("status").textContent).toContain("Loading")
    const skeletons = container.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBe(8)
    expect(skeletons[0]?.className).toContain("motion-reduce:animate-none")
    expect(screen.queryByText("Ada Lovelace")).toBeNull()
    await expectNoAxeViolations(container)
  })

  it("normalizes non-finite, fractional, or negative loading row counts", () => {
    const { container: nanContainer } = render(
      <DataTable
        columns={columns}
        rows={people}
        getRowId={getRowId}
        loading
        loadingRowCount={Number.NaN}
      />,
    )
    expect(nanContainer.querySelectorAll('[data-slot="skeleton"]').length).toBe(6)

    const { container: infContainer } = render(
      <DataTable
        columns={columns}
        rows={people}
        getRowId={getRowId}
        loading
        loadingRowCount={Number.POSITIVE_INFINITY}
      />,
    )
    expect(infContainer.querySelectorAll('[data-slot="skeleton"]').length).toBe(6)

    const { container: fracContainer } = render(
      <DataTable
        columns={columns}
        rows={people}
        getRowId={getRowId}
        loading
        loadingRowCount={2.9}
      />,
    )
    expect(fracContainer.querySelectorAll('[data-slot="skeleton"]').length).toBe(4)
  })

  it("skips cell projection entirely while loading", () => {
    const cell = vi.fn((row: Person) => row.name)
    const spyColumns: readonly DataTableColumn<Person>[] = [{ id: "name", header: "Name", cell }]
    render(<DataTable columns={spyColumns} rows={people} getRowId={getRowId} loading />)
    expect(cell).not.toHaveBeenCalled()
  })

  it("cycles a sortable header through asc → desc → unset and reflects aria-sort", async () => {
    const onSortChange = vi.fn()
    render(
      <DataTable columns={columns} rows={people} getRowId={getRowId} onSortChange={onSortChange} />,
    )
    const user = userEvent.setup()

    const nameHeader = (): HTMLElement => screen.getByRole("columnheader", { name: /Name/ })
    const sortButton = (): HTMLElement => within(nameHeader()).getByRole("button")

    expect(nameHeader().getAttribute("aria-sort")).toBeNull()

    await user.click(sortButton())
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: "name", direction: "asc" })
    expect(nameHeader().getAttribute("aria-sort")).toBe("ascending")

    await user.click(sortButton())
    expect(onSortChange).toHaveBeenLastCalledWith({ columnId: "name", direction: "desc" })
    expect(nameHeader().getAttribute("aria-sort")).toBe("descending")

    await user.click(sortButton())
    expect(onSortChange).toHaveBeenLastCalledWith(null)
    expect(nameHeader().getAttribute("aria-sort")).toBeNull()
  })

  it("honours a controlled sort prop over internal state", () => {
    const sort: DataTableSort = { columnId: "name", direction: "desc" }
    render(<DataTable columns={columns} rows={people} getRowId={getRowId} sort={sort} />)
    expect(screen.getByRole("columnheader", { name: /Name/ }).getAttribute("aria-sort")).toBe(
      "descending",
    )
  })

  it("renders injected sort-state copy and icons for the active column", () => {
    render(
      <DataTable
        columns={columns}
        rows={people}
        getRowId={getRowId}
        sort={{ columnId: "name", direction: "asc" }}
        labels={{ sortAscending: "A to Z" }}
        icons={{ sortAscending: <span data-testid="asc-icon">↑</span> }}
      />,
    )
    expect(screen.getByText("A to Z")).toBeDefined()
    expect(screen.getByTestId("asc-icon")).toBeDefined()
  })

  it("selects all rows and reflects the indeterminate state (uncontrolled)", async () => {
    const { container } = render(
      <DataTable
        columns={columns}
        rows={people}
        getRowId={getRowId}
        getRowAriaLabel={(person) => `Select ${person.name}`}
        selectable
      />,
    )
    const user = userEvent.setup()

    const selectAll = screen.getByRole("checkbox", { name: "Select all visible rows" })
    expect(screen.getByRole("checkbox", { name: "Select Ada Lovelace" })).toBeDefined()
    expect(screen.getByRole("checkbox", { name: "Select Alan Turing" })).toBeDefined()

    const adaRow = screen.getByRole("row", { name: /Ada Lovelace/ })
    await user.click(within(adaRow).getByRole("checkbox", { name: "Select Ada Lovelace" }))
    expect(selectAll.getAttribute("aria-checked")).toBe("mixed")

    await user.click(selectAll)
    expect(
      screen
        .getByRole("checkbox", { name: "Select all visible rows" })
        .getAttribute("aria-checked"),
    ).toBe("true")
    expect(
      screen.getByRole("checkbox", { name: "Select Ada Lovelace" }).getAttribute("aria-checked"),
    ).toBe("true")
    expect(
      screen.getByRole("checkbox", { name: "Select Alan Turing" }).getAttribute("aria-checked"),
    ).toBe("true")
    await expectNoAxeViolations(container)
  })

  it("formats default row-specific aria-label from row ID when getRowAriaLabel is omitted", () => {
    render(<DataTable columns={columns} rows={people} getRowId={getRowId} selectable />)
    expect(screen.getByRole("checkbox", { name: "Select row 1" })).toBeDefined()
    expect(screen.getByRole("checkbox", { name: "Select row 2" })).toBeDefined()
  })

  it("reports selection changes through onSelectionChange when controlled", async () => {
    const onSelectionChange = vi.fn()
    render(
      <DataTable
        columns={columns}
        rows={people}
        getRowId={getRowId}
        selectable
        selectedKeys={new Set()}
        onSelectionChange={onSelectionChange}
      />,
    )

    const turingRow = screen.getByRole("row", { name: /Alan Turing/ })
    await userEvent.setup().click(within(turingRow).getByRole("checkbox"))
    const next = onSelectionChange.mock.calls.at(-1)?.[0] as ReadonlySet<string>
    expect([...next]).toEqual(["2"])
  })

  it("drives a fully controlled selection round-trip from the parent", async () => {
    function Controlled(): ReturnType<typeof DataTable> {
      const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
      return (
        <>
          <p>selected: {[...selected].join(",")}</p>
          <DataTable
            columns={columns}
            rows={people}
            getRowId={getRowId}
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
          />
        </>
      )
    }
    render(<Controlled />)

    await userEvent.setup().click(screen.getByRole("checkbox", { name: "Select all visible rows" }))
    expect(screen.getByText("selected: 1,2")).toBeDefined()
  })

  it("hides low-priority columns in narrow container presentations", () => {
    const responsiveColumns: DataTableColumn<Person>[] = [
      { id: "name", header: "Name", cell: (p) => p.name, priority: "high" },
      { id: "role", header: "Role", cell: (p) => p.role, priority: "low" },
    ]
    render(<DataTable columns={responsiveColumns} rows={people} getRowId={getRowId} />)
    const roleHeader = screen.getByRole("columnheader", { name: "Role" })
    expect(roleHeader.className).toContain("@max-sm:hidden")
    const cells = screen.getAllByRole("cell", { name: /Engineer|Researcher/ })
    expect(cells[0]?.className).toContain("@max-sm:hidden")
  })

  it("aligns sortable header buttons according to column alignment", () => {
    const alignedColumns: DataTableColumn<Person>[] = [
      { id: "startCol", header: "Start", cell: (p) => p.name, sortable: true, align: "start" },
      { id: "centerCol", header: "Center", cell: (p) => p.name, sortable: true, align: "center" },
      { id: "endCol", header: "End", cell: (p) => p.role, sortable: true, align: "end" },
    ]
    render(<DataTable columns={alignedColumns} rows={people} getRowId={getRowId} />)

    const startBtn = screen.getByRole("button", { name: "Start" })
    expect(startBtn.className).toContain("justify-between")

    const centerBtn = screen.getByRole("button", { name: "Center" })
    expect(centerBtn.className).toContain("justify-center")

    const endBtn = screen.getByRole("button", { name: "End" })
    expect(endBtn.className).toContain("justify-end")
  })
})
