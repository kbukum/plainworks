// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { DataTableColumn, DataTableSort } from "./columns"
import { DataTable } from "./table"

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
        getRowLabel={(person) => person.name}
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

  it("names a row by its id when getRowLabel is omitted", () => {
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

  it("moves low-priority columns into a row-detail disclosure in a narrow container", async () => {
    // jsdom has no layout engine, so container-query visibility is proven in the showcase browser
    // gates; here the classes pin which presentation each part belongs to.
    const responsiveColumns: DataTableColumn<Person>[] = [
      { id: "name", header: "Name", cell: (p) => p.name, priority: "high" },
      { id: "role", header: "Role", cell: (p) => p.role, priority: "low" },
    ]
    const { container } = render(
      <DataTable
        columns={responsiveColumns}
        rows={people}
        getRowId={getRowId}
        getRowLabel={(p) => p.name}
      />,
    )
    const user = userEvent.setup()

    expect(screen.getByRole("columnheader", { name: "Role" }).className).toContain(
      "@max-2xl:hidden",
    )
    expect(screen.getByRole("cell", { name: "Engineer" }).className).toContain("@max-2xl:hidden")
    expect(screen.getByRole("columnheader", { name: "Details" }).className).toContain("@2xl:hidden")

    const toggle = screen.getByRole("button", { name: "Details for Ada Lovelace" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(toggle.getAttribute("aria-controls")).toBeNull()

    await user.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    const detail = document.getElementById(toggle.getAttribute("aria-controls") ?? "")
    expect(detail?.className).toContain("@2xl:hidden")
    const terms = within(detail as HTMLElement).getAllByRole("term")
    const values = within(detail as HTMLElement).getAllByRole("definition")
    expect(terms.map((term) => term.textContent)).toEqual(["Role"])
    expect(values.map((value) => value.textContent)).toEqual(["Engineer"])
    await expectNoAxeViolations(container)

    await user.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(detail?.isConnected).toBe(false)
  })

  it("mounts each low-priority value once, even while its row detail is open", async () => {
    function RoleBadge({ role }: { readonly role: string }) {
      return <span id={`role-${role}`}>{role}</span>
    }
    const responsiveColumns: DataTableColumn<Person>[] = [
      { id: "name", header: "Name", cell: (p) => p.name },
      { id: "role", header: "Role", cell: (p) => <RoleBadge role={p.role} />, priority: "low" },
    ]
    render(
      <DataTable
        columns={responsiveColumns}
        rows={people}
        getRowId={getRowId}
        getRowLabel={(p) => p.name}
      />,
    )

    await userEvent.setup().click(screen.getByRole("button", { name: "Details for Ada Lovelace" }))

    expect(document.querySelectorAll("#role-Engineer")).toHaveLength(1)
    expect(screen.getByRole("definition").textContent).toBe("Engineer")
  })

  it("closes open row details once the container is wide enough for every column", async () => {
    let notifyResize = (): void => undefined
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notifyResize = callback
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    try {
      const responsiveColumns: DataTableColumn<Person>[] = [
        { id: "name", header: "Name", cell: (p) => p.name },
        { id: "role", header: "Role", cell: (p) => p.role, priority: "low" },
      ]
      render(
        <DataTable
          columns={responsiveColumns}
          rows={people}
          getRowId={getRowId}
          getRowLabel={(p) => p.name}
        />,
      )
      const toggle = screen.getByRole("button", { name: "Details for Ada Lovelace" })
      await userEvent.setup().click(toggle)
      expect(toggle.getAttribute("aria-expanded")).toBe("true")

      // jsdom lays nothing out, so the details column reads as hidden, as it does once wide.
      act(() => notifyResize())

      expect(toggle.getAttribute("aria-expanded")).toBe("false")
      expect(screen.getByRole("cell", { name: "Engineer" })).toBeDefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("forgets open row details for rows that leave the table", async () => {
    const responsiveColumns: DataTableColumn<Person>[] = [
      { id: "name", header: "Name", cell: (p) => p.name },
      { id: "role", header: "Role", cell: (p) => p.role, priority: "low" },
    ]
    const nextPage: readonly Person[] = [{ id: "3", name: "Grace Hopper", role: "Admiral" }]
    const table = (rows: readonly Person[]) => (
      <DataTable
        columns={responsiveColumns}
        rows={rows}
        getRowId={getRowId}
        getRowLabel={(p) => p.name}
      />
    )
    const { rerender } = render(table(people))
    await userEvent.setup().click(screen.getByRole("button", { name: "Details for Ada Lovelace" }))

    rerender(table(nextPage))
    rerender(table(people))

    const toggle = screen.getByRole("button", { name: "Details for Ada Lovelace" })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
  })

  it("adds no disclosure when every column is essential", () => {
    render(<DataTable columns={columns} rows={people} getRowId={getRowId} />)
    expect(screen.queryByRole("columnheader", { name: "Details" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Details for/ })).toBeNull()
  })

  it("keeps the caption as the table's name without repeating it on screen", () => {
    const { rerender } = render(
      <DataTable columns={columns} rows={people} getRowId={getRowId} caption="Team" />,
    )
    const caption = screen.getByRole("table", { name: "Team" }).querySelector("caption")
    expect(caption?.className).toContain("sr-only")
    rerender(
      <DataTable columns={columns} rows={people} getRowId={getRowId} caption="Team" showCaption />,
    )
    const shown = screen.getByRole("table", { name: "Team" }).querySelector("caption")
    expect(shown?.className).not.toContain("sr-only")
  })

  it("renders a caller-owned empty view with its next action", () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        getRowId={getRowId}
        empty={<button type="button">Invite a teammate</button>}
      />,
    )
    expect(screen.getByRole("button", { name: "Invite a teammate" })).toBeDefined()
    expect(screen.queryByText("No results")).toBeNull()
  })

  it("keeps a short id column on one line", () => {
    const idColumns: DataTableColumn<Person>[] = [
      { id: "id", header: "ID", cell: (p) => p.id, nowrap: true },
      ...columns,
    ]
    render(<DataTable columns={idColumns} rows={people} getRowId={getRowId} />)
    expect(screen.getByRole("cell", { name: "1" }).className).toContain("whitespace-nowrap")
    expect(screen.getByRole("cell", { name: "Ada Lovelace" }).className).toContain("wrap-anywhere")
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
