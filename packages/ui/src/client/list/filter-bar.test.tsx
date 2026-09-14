// @vitest-environment jsdom

import type { ListFilter } from "@plainworks/std"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
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
