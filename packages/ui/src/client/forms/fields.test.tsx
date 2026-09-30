// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { CheckboxField } from "./checkbox-field"
import { DateField } from "./date-field"
import { NumberField } from "./number-field"
import { SelectField } from "./select-field"
import { SwitchField } from "./switch-field"
import { TextField } from "./text-field"
import { TextareaField } from "./textarea-field"

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
  it("is a labelled number field with named steppers and no violations", async () => {
    const { container } = render(<NumberField name="age" label="Age" defaultValue={30} />)
    const input = screen.getByRole("textbox", { name: "Age" }) as HTMLInputElement
    expect(input.value).toBe("30")
    expect(screen.getByRole("button", { name: "Increase" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Decrease" })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("steps with the keyboard, clamps to the bounds, and submits the number", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <form>
        <NumberField name="qty" label="Quantity" defaultValue={4} min={0} max={5} />
      </form>,
    )
    const input = screen.getByRole("textbox", { name: "Quantity" }) as HTMLInputElement

    await user.click(input)
    await user.keyboard("{ArrowUp}{ArrowUp}")

    expect(input.value).toBe("5")
    const form = container.querySelector("form")
    expect(form === null ? null : new FormData(form).get("qty")).toBe("5")
  })

  it("names the steppers from the labels", () => {
    render(
      <NumberField name="qty" label="Menge" labels={{ increment: "Mehr", decrement: "Weniger" }} />,
    )
    expect(screen.getByRole("button", { name: "Mehr" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Weniger" })).toBeDefined()
  })

  it("marks a required field for assistive tech", () => {
    render(<NumberField name="qty" label="Quantity" required />)
    expect(screen.getByRole("textbox", { name: /Quantity/ }).hasAttribute("required")).toBe(true)
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

  it("reads its description with the label, before the switch", () => {
    render(<SwitchField name="sms" label="SMS" description="Alerts by text message." />)
    const control = screen.getByRole("switch", { name: "SMS" })
    const description = screen.getByText("Alerts by text message.")
    expect(control.getAttribute("aria-describedby")).toBe(description.id)
    // DOCUMENT_POSITION_FOLLOWING: the switch comes after the text that explains it.
    expect(description.compareDocumentPosition(control) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })
})
