// @vitest-environment jsdom

import type { ListFilter } from "@plainworks/std"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FilterBar } from "./filter-bar"
import type { FilterFieldDef } from "./filter-model"

afterEach(cleanup)

const fields: readonly FilterFieldDef[] = [
  { field: "name", label: "Name", type: "text" },
  { field: "price", label: "Price", type: "number" },
  {
    field: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "open", label: "Open" },
      { value: "closed", label: "Closed" },
    ],
  },
]

describe("FilterBar", () => {
  it("adds a default filter for the first field", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterBar fields={fields} value={[]} onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Add filter" }))
    expect(onChange).toHaveBeenCalledWith([{ field: "name", op: "eq", value: "" }])
  })

  it("edits a scalar value into the emitted std/list filter", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    function Host(): ReactElement {
      const [value, setValue] = useState<readonly ListFilter[]>([
        { field: "name", op: "eq", value: "" },
      ])
      return (
        <FilterBar
          fields={fields}
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
        />
      )
    }
    render(<Host />)

    await user.type(screen.getByRole("textbox", { name: "Value" }), "ada")
    expect(onChange).toHaveBeenLastCalledWith([{ field: "name", op: "eq", value: "ada" }])
  })

  it("drops the value editor for a presence operator", () => {
    const value: readonly ListFilter[] = [{ field: "name", op: "notNull" }]
    render(<FilterBar fields={fields} value={value} onChange={vi.fn()} />)
    expect(screen.queryByRole("textbox", { name: "Value" })).toBeNull()
  })

  it("rebuilds the filter when the operator changes to a presence check", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: readonly ListFilter[] = [{ field: "name", op: "eq", value: "x" }]
    render(<FilterBar fields={fields} value={value} onChange={onChange} />)

    await user.selectOptions(screen.getByRole("combobox", { name: "Operator" }), "null")
    expect(onChange).toHaveBeenCalledWith([{ field: "name", op: "null" }])
  })

  it("keeps operators valid when the field changes", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: readonly ListFilter[] = [{ field: "name", op: "like", value: "x" }]
    render(<FilterBar fields={fields} value={value} onChange={onChange} />)

    await user.selectOptions(screen.getByRole("combobox", { name: "Field" }), "price")
    // `like` is not a numeric operator, so the row falls back to the field's first operator.
    expect(onChange).toHaveBeenCalledWith([{ field: "price", op: "eq", value: "x" }])
  })

  it("defaults a scalar select filter to a real option, never a blank value", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // A carried-over free-text value ("x") is not one of the status options; switching to the
    // select field must resolve it to the first option rather than emit an impossible value.
    const value: readonly ListFilter[] = [{ field: "name", op: "eq", value: "x" }]
    render(<FilterBar fields={fields} value={value} onChange={onChange} />)

    await user.selectOptions(screen.getByRole("combobox", { name: "Field" }), "status")
    expect(onChange).toHaveBeenCalledWith([{ field: "status", op: "eq", value: "open" }])
  })

  it("removes a filter row", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const value: readonly ListFilter[] = [{ field: "name", op: "eq", value: "a" }]
    render(<FilterBar fields={fields} value={value} onChange={onChange} />)

    await user.click(screen.getByRole("button", { name: "Remove filter 1" }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("keeps only the first value when a list operator changes to a scalar", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    // A text field that also allows `in`, so switching to `eq` must not feed the multi-line list
    // serialization ("a\nb") to the scalar builder.
    const tagFields: readonly FilterFieldDef[] = [
      { field: "tags", label: "Tags", type: "text", operators: ["in", "eq"] },
    ]
    const value: readonly ListFilter[] = [{ field: "tags", op: "in", value: ["a", "b"] }]
    render(<FilterBar fields={tagFields} value={value} onChange={onChange} />)

    await user.selectOptions(screen.getByRole("combobox", { name: "Operator" }), "eq")
    expect(onChange).toHaveBeenCalledWith([{ field: "tags", op: "eq", value: "a" }])
  })

  it("keeps each row's list-editor draft bound to its row across a removal", async () => {
    const user = userEvent.setup()

    function Host(): ReactElement {
      const [value, setValue] = useState<readonly ListFilter[]>([
        { field: "status", op: "in", value: ["open"] },
        { field: "status", op: "in", value: ["open"] },
      ])
      return <FilterBar fields={fields} value={value} onChange={setValue} />
    }
    render(<Host />)

    const editors = screen.getAllByRole("textbox", { name: "Value" })
    // An uncommitted trailing space stays in the first row's draft (the parsed value is unchanged).
    await user.type(editors[0] as HTMLTextAreaElement, " ")
    await user.click(screen.getAllByRole("button", { name: /Remove filter/ })[0] as HTMLElement)

    // The surviving row keeps its own clean value rather than inheriting the removed row's draft.
    const remaining = screen.getAllByRole("textbox", { name: "Value" })
    expect(remaining).toHaveLength(1)
    expect((remaining[0] as HTMLTextAreaElement).value).toBe("open")
  })

  it("has no accessibility violations", async () => {
    const value: readonly ListFilter[] = [{ field: "status", op: "eq", value: "open" }]
    const { container } = render(<FilterBar fields={fields} value={value} onChange={vi.fn()} />)
    await expectNoAxeViolations(container)
  })

  it("preserves a filter whose field is absent from `fields` instead of aliasing it", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    function Host(): ReactElement {
      const [value, setValue] = useState<readonly ListFilter[]>([
        { field: "legacy", op: "eq", value: "x" },
      ])
      return (
        <FilterBar
          fields={fields}
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
        />
      )
    }
    render(<Host />)

    // The stale field is offered as its own picker option and stays selected.
    expect((screen.getByRole("combobox", { name: "Field" }) as HTMLSelectElement).value).toBe(
      "legacy",
    )
    await user.type(screen.getByRole("textbox", { name: "Value" }), "y")
    expect(onChange).toHaveBeenLastCalledWith([{ field: "legacy", op: "eq", value: "xy" }])
  })

  it("edits list values one-per-line so a value containing a comma survives", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    function Host(): ReactElement {
      const [value, setValue] = useState<readonly ListFilter[]>([
        { field: "status", op: "in", value: [] },
      ])
      return (
        <FilterBar
          fields={fields}
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
        />
      )
    }
    render(<Host />)

    await user.type(screen.getByRole("textbox", { name: "Value" }), "New York, NY{enter}Paris")
    expect(onChange).toHaveBeenLastCalledWith([
      { field: "status", op: "in", value: ["New York, NY", "Paris"] },
    ])
  })

  it("relabels a single operator through a partial `operators` override", () => {
    const value: readonly ListFilter[] = [{ field: "name", op: "eq", value: "" }]
    render(
      <FilterBar
        fields={fields}
        value={value}
        onChange={vi.fn()}
        labels={{ operators: { eq: "IS" } }}
      />,
    )

    const operator = screen.getByRole("combobox", { name: "Operator" })
    expect(within(operator).getByRole("option", { name: "IS" })).toBeTruthy()
    // Other operators keep their defaults — the override is a subset merge, not a replacement.
    expect(within(operator).getByRole("option", { name: "Not equals" })).toBeTruthy()
  })
})

function ControlledFilterBar({
  initial = [],
}: {
  readonly initial?: readonly ListFilter[]
}): ReactElement {
  const [value, setValue] = useState<readonly ListFilter[]>(initial)
  return <FilterBar fields={fields} value={value} onChange={setValue} />
}

describe("FilterBar applied state and keyboard flow", () => {
  it("announces how many filters apply and clears them all at once", async () => {
    const user = userEvent.setup()
    render(
      <ControlledFilterBar
        initial={[
          { field: "name", op: "eq", value: "a" },
          { field: "price", op: "gt", value: 5 },
        ]}
      />,
    )

    expect(screen.getByRole("status").textContent).toBe("2 filters applied")
    await user.click(screen.getByRole("button", { name: "Clear all filters" }))
    expect(screen.getByRole("status").textContent).toBe("No filters applied")
    expect(screen.queryByRole("button", { name: "Clear all filters" })).toBeNull()
    expect(screen.getByRole("button", { name: "Add filter" })).toBe(document.activeElement)
  })

  it("moves focus to the new row's field picker after adding a filter", async () => {
    const user = userEvent.setup()
    render(<ControlledFilterBar />)

    await user.click(screen.getByRole("button", { name: "Add filter" }))
    const row = screen.getByRole("group", { name: "Filter 1" })
    expect(within(row).getByRole("combobox", { name: "Field" })).toBe(document.activeElement)
    expect(screen.getByRole("status").textContent).toBe("1 filter applied")
  })

  it("keeps focus in the list when a row is removed", async () => {
    const user = userEvent.setup()
    render(
      <ControlledFilterBar
        initial={[
          { field: "name", op: "eq", value: "a" },
          { field: "price", op: "gt", value: 5 },
        ]}
      />,
    )

    await user.click(screen.getByRole("button", { name: "Remove filter 1" }))
    const remaining = screen.getByRole("group", { name: "Filter 1" })
    expect(within(remaining).getByRole("combobox", { name: "Field" })).toBe(document.activeElement)
    expect(within(remaining).getByRole("combobox", { name: "Field" })).toHaveProperty(
      "value",
      "price",
    )

    await user.click(screen.getByRole("button", { name: "Remove filter 1" }))
    expect(screen.getByRole("button", { name: "Add filter" })).toBe(document.activeElement)
  })

  it("moves focus once a parent commits the change later, not before", async () => {
    const user = userEvent.setup()
    let commit = (): void => undefined
    function DeferredFilterBar(): ReactElement {
      const [value, setValue] = useState<readonly ListFilter[]>([
        { field: "name", op: "eq", value: "a" },
        { field: "price", op: "gt", value: 5 },
      ])
      return (
        <FilterBar
          fields={fields}
          value={value}
          onChange={(next) => {
            commit = () => setValue(next)
          }}
        />
      )
    }
    render(<DeferredFilterBar />)

    await user.click(screen.getByRole("button", { name: "Add filter" }))
    expect(screen.queryByRole("group", { name: "Filter 3" })).toBeNull()
    act(() => commit())
    const added = screen.getByRole("group", { name: "Filter 3" })
    expect(within(added).getByRole("combobox", { name: "Field" })).toBe(document.activeElement)

    await user.click(screen.getByRole("button", { name: "Remove filter 1" }))
    expect(screen.getByRole("group", { name: "Filter 3" })).toBeDefined()
    act(() => commit())
    const next = screen.getByRole("group", { name: "Filter 1" })
    expect(within(next).getByRole("combobox", { name: "Field" })).toBe(document.activeElement)
    expect(within(next).getByRole("combobox", { name: "Field" })).toHaveProperty("value", "price")
  })

  it("cancels a pending focus request when a parent supplies a different filter set", async () => {
    const user = userEvent.setup()
    function RejectingFilterBar(): ReactElement {
      const [value, setValue] = useState<readonly ListFilter[]>([])
      return (
        <>
          <button type="button" onClick={() => setValue([{ field: "price", op: "gt", value: 5 }])}>
            Load saved filters
          </button>
          <FilterBar fields={fields} value={value} onChange={() => undefined} />
        </>
      )
    }
    render(<RejectingFilterBar />)

    await user.click(screen.getByRole("button", { name: "Add filter" }))
    const loadButton = screen.getByRole("button", { name: "Load saved filters" })
    await user.click(loadButton)

    expect(loadButton).toBe(document.activeElement)
    expect(screen.getByRole("combobox", { name: "Field" })).not.toBe(document.activeElement)
  })

  it("keeps stale saved filters removable when no fields are available", async () => {
    const user = userEvent.setup()
    function EmptyFieldsFilterBar(): ReactElement {
      const [value, setValue] = useState<readonly ListFilter[]>([
        { field: "retired", op: "eq", value: "legacy" },
      ])
      return <FilterBar fields={[]} value={value} onChange={setValue} />
    }
    render(<EmptyFieldsFilterBar />)

    expect(screen.getByRole("group", { name: "Filter 1" })).toBeDefined()
    expect(screen.getByRole("status").textContent).toBe("1 filter applied")
    expect(screen.queryByRole("button", { name: "Add filter" })).toBeNull()

    await user.click(screen.getByRole("button", { name: "Clear all filters" }))
    expect(screen.getByRole("status").textContent).toBe("No filters applied")
    expect(screen.queryByRole("group", { name: "Filter 1" })).toBeNull()
  })

  it("adapts its rows to its own container width", () => {
    const { container } = render(<ControlledFilterBar />)
    expect(container.querySelector("fieldset")?.className).toContain("@container/filter-bar")
  })
})
