// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ToastProvider, useToast } from "./toast-host"

beforeEach(() => installMatchMedia(false))
afterEach(cleanup)

// The toast host reads the active theme through the `Toaster` atom, so it only renders inside a
// `ThemeProvider`; the theme source is a testkit fake, never a hand-rolled stub.
function Harness({ children }: { children: ReactNode }): ReactElement {
  return (
    <ThemeProvider source={fakeStateSource()}>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  )
}

function Raiser({ title = "Task saved" }: { readonly title?: string }): ReactElement {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.success({ title, description: "It is live." })}>
      Save
    </button>
  )
}

describe("toast host", () => {
  it("raises a titled toast through the context API", async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        <Raiser />
      </Harness>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByText("Task saved")).toBeDefined()
    expect(screen.getByText("It is live.")).toBeDefined()
  })

  it("mounts an accessible notifications region with no axe violations", async () => {
    const { container } = render(<Harness>{null}</Harness>)
    expect(screen.getByRole("region")).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("keeps notifications inside the provider that raised them", async () => {
    const user = userEvent.setup()
    render(
      <>
        <section aria-label="First app">
          <Harness>
            <Raiser title="First task saved" />
          </Harness>
        </section>
        <section aria-label="Second app">
          <Harness>
            <Raiser title="Second task saved" />
          </Harness>
        </section>
      </>,
    )

    await user.click(within(screen.getByRole("region", { name: "First app" })).getByRole("button"))

    expect(
      await within(screen.getByRole("region", { name: "First app" })).findByText(
        "First task saved",
      ),
    ).toBeDefined()
    expect(
      within(screen.getByRole("region", { name: "Second app" })).queryByText("First task saved"),
    ).toBeNull()
  })

  it("throws when useToast is read outside its provider", () => {
    function Orphan(): ReactElement {
      useToast()
      return <span>never</span>
    }
    expect(() => render(<Orphan />)).toThrow(/ToastProvider/)
  })
})
