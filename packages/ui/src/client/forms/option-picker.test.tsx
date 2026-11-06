// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OptionPicker, type PickerOption } from "./option-picker"

afterEach(cleanup)

/** The text of the elements an element's `aria-describedby` names, joined by spaces. */
const description = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ")

const SIZES: readonly PickerOption[] = [
  { value: "small", label: "Small", detail: "1.2 GB", badge: "Recommended" },
  { value: "medium", label: "Medium", detail: "5.0 GB" },
  { value: "large", label: "Large", detail: "40 GB", disabledReason: "Can't run here: needs MLX" },
]

function Picker({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState("small")
  return (
    <OptionPicker
      label="Size"
      description="Bigger models answer better and need more memory."
      options={SIZES}
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe("OptionPicker", () => {
  it("names the group and each choice, with its detail, badge and why it can't be picked", async () => {
    const { container } = render(<Picker onChange={() => undefined} />)
    const group = screen.getByRole("radiogroup", { name: "Size" })
    expect(description(group)).toBe("Bigger models answer better and need more memory.")
    const small = within(group).getByRole("radio", { name: /Small/ })
    expect(small.getAttribute("aria-checked")).toBe("true")
    expect(description(small)).toBe("1.2 GB Recommended")
    const large = within(group).getByRole("radio", { name: /Large/ })
    expect(large.getAttribute("aria-disabled")).toBe("true")
    expect(description(large)).toBe("40 GB Can't run here: needs MLX")
    expect(within(group).getByText("Can't run here: needs MLX")).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("picks with a click and with arrow keys, skipping a choice that can't be picked", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Picker onChange={onChange} />)
    await user.click(screen.getByRole("radio", { name: /Medium/ }))
    expect(onChange).toHaveBeenLastCalledWith("medium")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Medium/ }))
    await user.keyboard("{ArrowDown}")
    expect(onChange).toHaveBeenLastCalledWith("small")
    expect(onChange).not.toHaveBeenCalledWith("large")
  })

  it("names the picked choice when there are no options to pick", async () => {
    const { container } = render(
      <OptionPicker
        label="Quality"
        options={[]}
        value={undefined}
        onValueChange={() => undefined}
      />,
    )
    expect(screen.getByRole("radiogroup", { name: "Quality" })).toBeDefined()
    await expectNoAxeViolations(container)
  })
})
