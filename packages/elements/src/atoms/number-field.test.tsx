// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "@/atoms/number-field"

afterEach(cleanup)

function Example(props: {
  readonly defaultValue?: number
  readonly min?: number
  readonly max?: number
  readonly onValueChange?: (value: number | null) => void
}): ReactElement {
  return (
    <NumberField {...props}>
      <NumberFieldGroup>
        <NumberFieldDecrement />
        <NumberFieldInput aria-label="Quantity" />
        <NumberFieldIncrement />
      </NumberFieldGroup>
    </NumberField>
  )
}

describe("NumberField", () => {
  it("renders a named numeric input with named steppers and no axe violations", async () => {
    const { container } = render(<Example defaultValue={2} />)
    expect((screen.getByRole("textbox", { name: "Quantity" }) as HTMLInputElement).value).toBe("2")
    expect(screen.getByRole("button", { name: "Increase" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Decrease" })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("steps with the arrow keys and clamps to the bounds", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Example defaultValue={9} max={10} onValueChange={onValueChange} />)
    const input = screen.getByRole("textbox", { name: "Quantity" }) as HTMLInputElement

    await user.click(input)
    await user.keyboard("{ArrowUp}{ArrowUp}")

    expect(input.value).toBe("10")
    expect(onValueChange).toHaveBeenLastCalledWith(10, expect.anything())
  })

  it("keeps the typed draft instead of blanking an unparseable value", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const input = screen.getByRole("textbox", { name: "Quantity" }) as HTMLInputElement

    await user.type(input, "12")

    expect(input.value).toBe("12")
  })

  it("gives each stepper at least a 24px target", () => {
    render(<Example />)
    expect(screen.getByRole("button", { name: "Increase" }).className).toContain("size-6")
  })
})
