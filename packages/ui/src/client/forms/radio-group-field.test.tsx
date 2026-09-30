// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { RadioGroupField, type RadioGroupFieldOption } from "./radio-group-field"

afterEach(cleanup)

type Plan = "free" | "team"

const PLANS: readonly RadioGroupFieldOption<Plan>[] = [
  { value: "free", label: "Free", description: "For trying things out." },
  { value: "team", label: "Team", description: "Shared workspaces." },
]

describe("RadioGroupField", () => {
  it("is a named radio group whose options read their descriptions", async () => {
    const { container } = render(
      <RadioGroupField
        name="plan"
        label="Plan"
        description="You can change this later."
        options={PLANS}
        defaultValue="free"
      />,
    )
    const group = screen.getByRole("radiogroup", { name: "Plan" })
    expect(group.getAttribute("aria-describedby")).not.toBeNull()
    const free = screen.getByRole("radio", { name: /Free/ })
    expect(free.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: /Team/ }).getAttribute("aria-checked")).toBe("false")
    await expectNoAxeViolations(container)
  })

  it("moves the choice with arrow keys and submits it in FormData", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <form>
        <RadioGroupField name="plan" label="Plan" options={PLANS} defaultValue="free" />
      </form>,
    )
    await user.click(screen.getByRole("radio", { name: /Free/ }))
    await user.keyboard("{ArrowDown}")

    expect(screen.getByRole("radio", { name: /Team/ }).getAttribute("aria-checked")).toBe("true")
    const form = container.querySelector("form")
    expect(form === null ? null : new FormData(form).get("plan")).toBe("team")
  })

  it("reports a typed value to a controlled owner", async () => {
    const user = userEvent.setup()
    const seen: Plan[] = []
    function Controlled() {
      const [plan, setPlan] = useState<Plan>("free")
      return (
        <RadioGroupField
          name="plan"
          label="Plan"
          options={PLANS}
          value={plan}
          onValueChange={(next) => {
            seen.push(next)
            setPlan(next)
          }}
        />
      )
    }
    render(<Controlled />)
    await user.click(screen.getByRole("radio", { name: /Team/ }))
    expect(seen).toEqual(["team"])
    expect(screen.getByRole("radio", { name: /Team/ }).getAttribute("aria-checked")).toBe("true")
  })

  it("marks a required group for assistive tech", () => {
    render(<RadioGroupField name="plan" label="Plan" options={PLANS} required />)
    expect(screen.getByRole("radiogroup", { name: /Plan/ }).getAttribute("aria-required")).toBe(
      "true",
    )
  })
})
