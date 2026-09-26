// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Callout } from "./callout"
import { Spinner } from "./spinner"

afterEach(cleanup)

describe("Spinner", () => {
  it("exposes a labelled status region with a decorative indicator", async () => {
    const { container } = render(<Spinner label="Loading invoices" size="lg" />)
    const status = screen.getByRole("status")
    expect(status.textContent).toContain("Loading invoices")
    expect(container.querySelector('[data-slot="spinner"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    )
    await expectNoAxeViolations(container)
  })

  it("sits on the text baseline when placed inline", () => {
    render(<Spinner size="sm" />)
    expect(screen.getByRole("status").getAttribute("class")).toContain("align-middle")
  })
})

describe("Callout", () => {
  it("uses an assertive role for urgent tones and stays accessible", async () => {
    const { container } = render(
      <Callout tone="danger" title="Payment failed">
        Update your card and retry.
      </Callout>,
    )
    const alert = screen.getByRole("alert")
    expect(alert.getAttribute("data-tone")).toBe("danger")
    expect(alert.textContent).toContain("Payment failed")
    await expectNoAxeViolations(container)
  })

  it("uses a polite status role for informational tones", () => {
    render(
      <Callout tone="info" title="Heads up">
        A new version is available.
      </Callout>,
    )
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("info")
  })

  it.each(["info", "success", "warning", "danger"] as const)(
    "stays accessible in the %s tone",
    async (tone) => {
      const { container } = render(
        <Callout tone={tone} title="Notice">
          Details.
        </Callout>,
      )
      expect(container.querySelector(`[data-tone="${tone}"]`)).not.toBeNull()
      await expectNoAxeViolations(container)
    },
  )
})
