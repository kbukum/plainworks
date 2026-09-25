// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { Callout } from "./callout"
import { SkeletonText } from "./skeleton"
import { Spinner } from "./spinner"

afterEach(cleanup)

describe("Spinner", () => {
  it("exposes a labelled status region and disables motion on request", async () => {
    const { container } = render(<Spinner label="Loading invoices" size="lg" />)
    const status = screen.getByRole("status")
    expect(status.textContent).toContain("Loading invoices")
    expect(container.querySelector('[data-slot="spinner"]')?.getAttribute("aria-hidden")).toBe(
      "true",
    )
    expect(container.querySelector('[data-slot="spinner"]')?.getAttribute("class")).toContain(
      "motion-reduce:animate-none",
    )
    await expectNoAxeViolations(container)
  })

  it("sits on the text baseline when placed inline", () => {
    render(<Spinner size="sm" />)
    expect(screen.getByRole("status").getAttribute("class")).toContain("align-middle")
  })
})

describe("SkeletonText", () => {
  it("renders the requested number of decorative lines", async () => {
    const { container } = render(<SkeletonText lines={4} />)
    const root = container.querySelector('[data-slot="skeleton-text"]')
    expect(root?.getAttribute("aria-hidden")).toBe("true")
    expect(root?.querySelectorAll('[data-slot="skeleton"]').length).toBe(4)
    expect(root?.querySelector('[data-slot="skeleton"]')?.className).toContain(
      "motion-reduce:animate-none",
    )
    await expectNoAxeViolations(container)
  })

  it("clamps to at least one line", () => {
    const { container } = render(<SkeletonText lines={0} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(1)
  })

  it("normalizes non-finite and fractional lines safely", () => {
    const { container: nanContainer } = render(<SkeletonText lines={Number.NaN} />)
    expect(nanContainer.querySelectorAll('[data-slot="skeleton"]').length).toBe(3)

    const { container: infContainer } = render(<SkeletonText lines={Number.POSITIVE_INFINITY} />)
    expect(infContainer.querySelectorAll('[data-slot="skeleton"]').length).toBe(3)

    const { container: fracContainer } = render(<SkeletonText lines={2.7} />)
    expect(fracContainer.querySelectorAll('[data-slot="skeleton"]').length).toBe(2)
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
