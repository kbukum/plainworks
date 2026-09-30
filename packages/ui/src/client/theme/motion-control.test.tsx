// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import type { MotionPreference } from "@plainworks/theme/preference"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { MotionControl } from "./motion-control"

afterEach(cleanup)

function Harness({ seen }: { readonly seen: MotionPreference[] }) {
  const [motion, setMotion] = useState<MotionPreference>("system")
  return (
    <MotionControl
      value={motion}
      onValueChange={(next) => {
        seen.push(next)
        setMotion(next)
      }}
    />
  )
}

describe("MotionControl", () => {
  it("is a named radio group with a described choice per preference", async () => {
    const { container } = render(<Harness seen={[]} />)
    const group = screen.getByRole("radiogroup", { name: "Motion" })
    expect(group.getAttribute("aria-describedby")).not.toBeNull()
    const system = screen.getByRole("radio", { name: "Match system" })
    expect(system.getAttribute("aria-checked")).toBe("true")
    expect(system.getAttribute("aria-describedby")).not.toBeNull()
    expect(screen.getByRole("radio", { name: "Reduced motion" })).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("reports the new choice from the keyboard", async () => {
    const user = userEvent.setup()
    const seen: MotionPreference[] = []
    render(<Harness seen={seen} />)
    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(seen).toEqual(["reduce"])
    expect(screen.getByRole("radio", { name: "Reduced motion" }).getAttribute("aria-checked")).toBe(
      "true",
    )
  })

  it("takes injected labels", () => {
    render(
      <MotionControl
        value="reduce"
        onValueChange={() => undefined}
        labels={{ label: "Bewegung", reduce: "Weniger Bewegung" }}
      />,
    )
    expect(screen.getByRole("radiogroup", { name: "Bewegung" })).toBeDefined()
    expect(screen.getByRole("radio", { name: "Weniger Bewegung" })).toBeDefined()
  })
})
