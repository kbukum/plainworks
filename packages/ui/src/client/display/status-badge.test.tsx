// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { StatusBadge, type StatusTone } from "./status-badge"

afterEach(cleanup)

const TONES: readonly StatusTone[] = ["neutral", "info", "success", "warning", "danger"]

describe("StatusBadge", () => {
  it("renders its label as text in every tone, so status never rests on color alone", async () => {
    const { container } = render(
      <ul>
        {TONES.map((tone) => (
          <li key={tone}>
            <StatusBadge tone={tone}>{`${tone} state`}</StatusBadge>
          </li>
        ))}
      </ul>,
    )

    for (const tone of TONES) {
      const badge = screen.getByText(`${tone} state`)
      expect(badge.getAttribute("data-tone")).toBe(tone)
    }
    await expectNoAxeViolations(container)
  })

  it("defaults to the neutral tone", () => {
    render(<StatusBadge>Draft</StatusBadge>)
    expect(screen.getByText("Draft").getAttribute("data-tone")).toBe("neutral")
  })
})
