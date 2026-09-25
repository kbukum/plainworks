// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { Input } from "@/shadcn/input"

afterEach(cleanup)

describe("Input", () => {
  it("renders a labelled textbox and accepts typed input", async () => {
    const user = userEvent.setup()
    render(
      <>
        <label htmlFor="email">Email</label>
        <Input id="email" />
      </>,
    )
    const control = screen.getByRole("textbox", { name: "Email" })

    await user.type(control, "a@b.co")
    expect((control as HTMLInputElement).value).toBe("a@b.co")
  })

  it("takes keyboard focus by Tab", async () => {
    const user = userEvent.setup()
    render(
      <>
        <label htmlFor="email">Email</label>
        <Input id="email" />
      </>,
    )

    await user.tab()
    expect(screen.getByRole("textbox", { name: "Email" })).toBe(document.activeElement)
  })

  it("does not accept input when disabled", async () => {
    const user = userEvent.setup()
    render(
      <>
        <label htmlFor="email">Email</label>
        <Input id="email" disabled />
      </>,
    )
    const control = screen.getByRole("textbox", { name: "Email" })

    await user.type(control, "nope")
    expect((control as HTMLInputElement).value).toBe("")
  })

  it("exposes an invalid state to assistive tech", () => {
    render(
      <>
        <label htmlFor="email">Email</label>
        <Input id="email" aria-invalid />
      </>,
    )
    expect(screen.getByRole("textbox", { name: "Email" }).getAttribute("aria-invalid")).toBe("true")
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <>
        <label htmlFor="email">Email</label>
        <Input id="email" />
      </>,
    )
    await expectNoAxeViolations(container)
  })
})
