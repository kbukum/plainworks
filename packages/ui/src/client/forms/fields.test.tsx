// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  CheckboxField,
  DateField,
  NumberField,
  SelectField,
  SwitchField,
  TextareaField,
  TextField,
} from "./fields"

afterEach(cleanup)

describe("TextField", () => {
  it("renders a labelled text input with no violations", async () => {
    const { container } = render(<TextField name="name" label="Full name" placeholder="Ada" />)
    const input = screen.getByLabelText("Full name")
    expect(input.getAttribute("type")).toBeNull()
    expect(input.getAttribute("name")).toBe("name")
    expect(input.getAttribute("placeholder")).toBe("Ada")
    await expectNoAxeViolations(container)
  })

  it("marks a required field for assistive tech without native validation", () => {
    render(<TextField name="name" label="Full name" required />)
    expect(screen.getByLabelText(/Full name/).hasAttribute("required")).toBe(true)
  })
})

describe("NumberField", () => {
  it("is a numeric input", async () => {
    const { container } = render(<NumberField name="age" label="Age" />)
    const input = screen.getByLabelText("Age")
    expect(input.getAttribute("type")).toBe("number")
    expect(input.getAttribute("inputmode")).toBe("numeric")
    await expectNoAxeViolations(container)
  })
})

describe("DateField", () => {
  it("is a date input", async () => {
    const { container } = render(<DateField name="dob" label="Date of birth" />)
    expect(screen.getByLabelText("Date of birth").getAttribute("type")).toBe("date")
    await expectNoAxeViolations(container)
  })
})

describe("TextareaField", () => {
  it("renders a labelled multi-line control", async () => {
    const user = userEvent.setup()
    const { container } = render(<TextareaField name="bio" label="Bio" />)
    const textarea = screen.getByLabelText("Bio")
    await user.type(textarea, "hello")
    expect((textarea as HTMLTextAreaElement).value).toBe("hello")
    await expectNoAxeViolations(container)
  })
})

describe("SelectField", () => {
  it("renders options and a non-selectable placeholder", async () => {
    const { container } = render(
      <SelectField
        name="role"
        label="Role"
        placeholder="Choose a role"
        options={[
          { value: "admin", label: "Admin" },
          { value: "editor", label: "Editor", disabled: true },
        ]}
      />,
    )
    const select = screen.getByLabelText("Role") as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(["", "admin", "editor"])
    expect(select.options[0]?.disabled).toBe(true)
    expect(select.options[2]?.disabled).toBe(true)
    await expectNoAxeViolations(container)
  })
})

describe("CheckboxField", () => {
  it("toggles through its associated label", async () => {
    const user = userEvent.setup()
    const { container } = render(<CheckboxField name="agree" label="I agree" />)
    const checkbox = screen.getByRole("checkbox", { name: "I agree" })
    expect(checkbox.getAttribute("aria-checked")).toBe("false")
    await user.click(screen.getByText("I agree"))
    expect(checkbox.getAttribute("aria-checked")).toBe("true")
    await expectNoAxeViolations(container)
  })
})

describe("SwitchField", () => {
  it("renders an accessible switch", async () => {
    const { container } = render(<SwitchField name="notify" label="Notifications" />)
    expect(screen.getByRole("switch", { name: "Notifications" })).toBeDefined()
    await expectNoAxeViolations(container)
  })
})
