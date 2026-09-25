// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AsyncState } from "./async-state"
import { EmptyState } from "./empty-state"
import { ErrorState } from "./error-state"
import { LoadingState } from "./loading-state"

afterEach(cleanup)

describe("LoadingState", () => {
  it("announces its label once and hides the decorative placeholder", async () => {
    const { container } = render(<LoadingState label="Loading orders" lines={4} />)
    const status = screen.getByRole("status", { name: "Loading orders" })
    expect(status.textContent).toBe("Loading orders")
    const placeholder = container.querySelector('[data-slot="loading-state-placeholder"]')
    expect(placeholder?.getAttribute("aria-hidden")).toBe("true")
    expect(placeholder?.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4)
    await expectNoAxeViolations(container)
  })

  it("renders a caller-shaped placeholder that mirrors the destination layout", () => {
    const { container } = render(
      <LoadingState label="Loading stats">
        <div data-testid="card-shape" />
      </LoadingState>,
    )
    expect(screen.getByTestId("card-shape")).toBeDefined()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0)
  })

  it("normalizes a non-finite or fractional line count", () => {
    const { container, rerender } = render(<LoadingState label="Loading" lines={Number.NaN} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3)
    rerender(<LoadingState label="Loading" lines={0} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1)
    rerender(<LoadingState label="Loading" lines={2.7} />)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(2)
  })
})

describe("EmptyState", () => {
  it("explains the empty result and offers the next useful action", async () => {
    const onClear = vi.fn()
    const { container } = render(
      <EmptyState
        title="No orders match"
        description="Clear the filters to see every order."
        icon={<svg aria-hidden="true" />}
        action={
          <button type="button" onClick={onClear}>
            Clear filters
          </button>
        }
      />,
    )
    expect(screen.getByText("No orders match")).toBeDefined()
    expect(screen.getByText("Clear the filters to see every order.")).toBeDefined()
    await userEvent.setup().click(screen.getByRole("button", { name: "Clear filters" }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(container.querySelector('[data-slot="empty-icon"]')).not.toBeNull()
    await expectNoAxeViolations(container)
  })

  it("omits the optional slots", () => {
    const { container } = render(<EmptyState title="Nothing yet" />)
    expect(container.querySelector('[data-slot="empty-icon"]')).toBeNull()
    expect(container.querySelector('[data-slot="empty-description"]')).toBeNull()
    expect(container.querySelector('[data-slot="empty-content"]')).toBeNull()
  })
})

describe("ErrorState", () => {
  it("is an alert with a retry action, never mistaken for loading", async () => {
    const onRetry = vi.fn()
    const { container } = render(
      <ErrorState
        title="Orders are unavailable"
        description="The list could not be loaded."
        onRetry={onRetry}
      />,
    )
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toContain("Orders are unavailable")
    expect(alert.textContent).toContain("The list could not be loaded.")
    expect(screen.queryByRole("status")).toBeNull()
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }))
    expect(onRetry).toHaveBeenCalledOnce()
    await expectNoAxeViolations(container)
  })

  it("takes a custom retry label or a caller-owned link action", () => {
    const { rerender } = render(
      <ErrorState title="Failed" onRetry={() => undefined} retryLabel="Reload orders" />,
    )
    expect(screen.getByRole("button", { name: "Reload orders" })).toBeDefined()
    rerender(<ErrorState title="Failed" action={{ label: "Contact support", href: "/support" }} />)
    expect(screen.getByRole("link", { name: "Contact support" })).toBeDefined()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("renders a caller-owned button action", async () => {
    const onAction = vi.fn()
    render(<ErrorState title="Failed" action={{ label: "Sign in", onAction }} />)
    await userEvent.setup().click(screen.getByRole("button", { name: "Sign in" }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it("models caller-owned recovery as a known button or link", () => {
    // @ts-expect-error Arbitrary elements cannot guarantee an operable recovery control.
    void (<ErrorState title="Failed" action={<button type="button">Retry</button>} />)
    // @ts-expect-error `null` renders no recovery control.
    void (<ErrorState title="Failed" action={null} />)
    // @ts-expect-error Plain text does not describe how to operate the action.
    void (<ErrorState title="Failed" action="Contact support" />)
  })
})

describe("AsyncState", () => {
  const states = {
    loading: <LoadingState label="Loading orders" />,
    error: <ErrorState title="Orders are unavailable" onRetry={() => undefined} />,
    empty: <EmptyState title="No orders" />,
  }

  const texts = ["Loading orders", "Orders are unavailable", "No orders", "the rows"] as const

  it.each([
    ["pending", "Loading orders"],
    ["error", "Orders are unavailable"],
    ["empty", "No orders"],
    ["ready", "the rows"],
  ] as const)("renders only the %s view", (status, shown) => {
    const { container } = render(
      <AsyncState status={status} {...states}>
        <p>the rows</p>
      </AsyncState>,
    )
    for (const text of texts) {
      expect(container.textContent?.includes(text)).toBe(text === shown)
    }
  })

  it("renders the content for an empty status when no empty view is given", () => {
    render(
      <AsyncState status="empty" loading={states.loading} error={states.error}>
        <p>always has rows</p>
      </AsyncState>,
    )
    expect(screen.getByText("always has rows")).toBeDefined()
  })
})
