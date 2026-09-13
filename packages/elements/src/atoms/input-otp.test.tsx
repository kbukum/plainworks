// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/atoms/input-otp"

document.elementFromPoint = () => document.activeElement

afterEach(cleanup)

function Example() {
  return (
    <InputOTP maxLength={6} aria-label="One-time code">
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  )
}

describe("InputOTP", () => {
  it("exposes the hidden input as an accessible textbox", () => {
    render(<Example />)

    expect(screen.getByRole("textbox", { name: "One-time code" })).toBeTruthy()
  })

  it("fills one-character slots when digits are typed", async () => {
    const user = userEvent.setup()
    render(<Example />)

    const input = screen.getByRole("textbox", { name: "One-time code" })
    await user.type(input, "123")

    if (!(input instanceof HTMLInputElement)) {
      throw new TypeError("Expected the one-time code control to be an input element.")
    }

    expect(input.value).toBe("123")
    expect(screen.getByText("1")).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.getByText("3")).toBeTruthy()
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
