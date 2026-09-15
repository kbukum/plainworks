// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ErrorFallback } from "./error-fallback"

afterEach(cleanup)

describe("ErrorFallback", () => {
  it("announces a generic failure and exposes keyboard-operable recovery", async () => {
    const onReset = vi.fn()
    const { container } = render(<ErrorFallback onReset={onReset} />)

    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Something went wrong")
    expect(alert.textContent).toContain("The page could not be displayed. Try again.")
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }))
    expect(onReset).toHaveBeenCalledOnce()
    await expectNoAxeViolations(container)
  })

  it("never renders a raw error message — internal details stay on the reporting seam", () => {
    const onReset = vi.fn()
    // The component accepts no `error` prop: a caller cannot accidentally leak a transport
    // message ("GET https://internal.host/users/431 401") into the page through this fallback.
    render(<ErrorFallback onReset={onReset} />)
    expect(screen.getByRole("alert").textContent).not.toContain("internal.host")
  })

  it("renders caller-sanitized copy when provided", () => {
    render(
      <ErrorFallback
        onReset={() => {}}
        title="We could not load your invoices"
        description="Check your connection and try again."
      />,
    )
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("We could not load your invoices")
    expect(alert.textContent).toContain("Check your connection and try again.")
  })
})
