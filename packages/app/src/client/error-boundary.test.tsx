// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import axe from "axe-core"
import { createElement, type ReactNode, useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AppErrorBoundary, type ErrorFallbackProps } from "./error-boundary"

afterEach(cleanup)

function Fallback({ error, reset }: ErrorFallbackProps): ReactNode {
  return createElement(
    "div",
    null,
    createElement("p", null, `caught: ${error.message}`),
    createElement("button", { type: "button", onClick: reset }, "Try again"),
  )
}

/** Throws on the first render, then renders successfully — lets a reset actually recover. */
function Flaky({ boom }: { boom: boolean }): ReactNode {
  if (boom) {
    throw new Error("kaboom")
  }
  return createElement("p", null, "recovered")
}

describe("AppErrorBoundary", () => {
  it("catches a render error, reports it, and renders the injected fallback", () => {
    const onError = vi.fn()
    render(
      <AppErrorBoundary fallback={Fallback} onError={onError}>
        <Flaky boom={true} />
      </AppErrorBoundary>,
    )
    expect(screen.getByText("caught: kaboom")).toBeDefined()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it("recovers when the fallback's reset is invoked, firing onReset", async () => {
    const onReset = vi.fn()
    function Harness(): ReactNode {
      const [boom, setBoom] = useState(true)
      return createElement(AppErrorBoundary, {
        fallback: Fallback,
        onReset: () => {
          setBoom(false)
          onReset()
        },
        children: createElement(Flaky, { boom }),
      })
    }
    render(<Harness />)
    expect(screen.getByText("caught: kaboom")).toBeDefined()
    await userEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByText("recovered")).toBeDefined()
  })

  it("auto-resets when resetKeys change (e.g. on navigation)", () => {
    const { rerender } = render(
      <AppErrorBoundary fallback={Fallback} resetKeys={["/broken"]}>
        <Flaky boom={true} />
      </AppErrorBoundary>,
    )
    expect(screen.getByText("caught: kaboom")).toBeDefined()
    // Navigate: the key changes and the child no longer throws — the boundary clears itself.
    rerender(
      <AppErrorBoundary fallback={Fallback} resetKeys={["/ok"]}>
        <Flaky boom={false} />
      </AppErrorBoundary>,
    )
    expect(screen.getByText("recovered")).toBeDefined()
  })

  it("renders an accessible fallback (its reset control included) with no axe violations", async () => {
    const { container } = render(
      <main>
        <AppErrorBoundary fallback={Fallback}>
          <Flaky boom={true} />
        </AppErrorBoundary>
      </main>,
    )
    // The fallback owns interactive DOM (the "Try again" button), so it must clear the WCAG floor.
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined()
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
