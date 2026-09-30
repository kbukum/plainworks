// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { renderToString } from "react-dom/server"
import { afterEach, describe, expect, it } from "vitest"
import { ToastError, ToastProvider, useToast } from "./toast"

afterEach(cleanup)

function Raiser({
  label = "Save",
  title = "Task saved",
}: {
  readonly label?: string
  readonly title?: string
}): ReactElement {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.success({ title, description: "It is live." })}>
      {label}
    </button>
  )
}

describe("ToastProvider", () => {
  it("raises a titled toast through the context API", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ToastProvider>
        <Raiser />
      </ToastProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    const region = screen.getByRole("region", { name: "Notifications" })
    expect(await within(region).findByText("Task saved")).toBeDefined()
    expect(within(region).getByText("It is live.")).toBeDefined()
    await expectNoAxeViolations(container.ownerDocument.body)
  })

  it("names the region and the close button from the labels", async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider labels={{ region: "Benachrichtigungen", close: "Schließen" }}>
        <Raiser />
      </ToastProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    const region = screen.getByRole("region", { name: "Benachrichtigungen" })
    await within(region).findByText("Task saved")
    // The stack hides its close buttons until it expands on hover or focus.
    await user.hover(region)
    expect(await within(region).findByRole("button", { name: "Schließen" })).toBeDefined()
  })

  it("dismisses a toast from its close button with the keyboard", async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <Raiser />
      </ToastProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))
    const region = screen.getByRole("region", { name: "Notifications" })
    await within(region).findByText("Task saved")
    await user.hover(region)
    const close = await within(region).findByRole("button", { name: "Dismiss notification" })
    close.focus()
    await user.keyboard("{Enter}")

    await expect.poll(() => screen.queryByText("Task saved")).toBeNull()
  })

  it("renders a caller icon for the toast tone", async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider icons={{ success: <span data-testid="success-icon" /> }}>
        <Raiser />
      </ToastProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByTestId("success-icon")).toBeDefined()
  })

  it("keeps two providers isolated: each shows only its own toasts", async () => {
    const user = userEvent.setup()
    render(
      <>
        <ToastProvider labels={{ region: "First" }}>
          <Raiser label="Raise first" title="From first" />
        </ToastProvider>
        <ToastProvider labels={{ region: "Second" }}>
          <Raiser label="Raise second" title="From second" />
        </ToastProvider>
      </>,
    )

    await user.click(screen.getByRole("button", { name: "Raise first" }))

    const first = screen.getByRole("region", { name: "First" })
    const second = screen.getByRole("region", { name: "Second" })
    expect(await within(first).findByText("From first")).toBeDefined()
    expect(within(second).queryByText("From first")).toBeNull()
  })

  it("settles a promise toast from loading to success", async () => {
    const user = userEvent.setup()
    let resolve: (value: string) => void = () => undefined
    function PromiseRaiser(): ReactElement {
      const toast = useToast()
      return (
        <button
          type="button"
          onClick={() => {
            void toast.promise(
              new Promise<string>((done) => {
                resolve = done
              }),
              {
                loading: "Saving…",
                success: (name) => ({ title: `Saved ${name}` }),
                error: "Could not save",
              },
            )
          }}
        >
          Save
        </button>
      )
    }
    render(
      <ToastProvider>
        <PromiseRaiser />
      </ToastProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("Saving…")).toBeDefined()
    resolve("report")

    expect(await screen.findByText("Saved report")).toBeDefined()
  })

  it("throws a typed error when useToast runs outside a provider", () => {
    expect(() => render(<Raiser />)).toThrow(ToastError)
    expect(() => render(<Raiser />)).toThrow("useToast must be used inside <ToastProvider>.")
  })
})

describe("ToastProvider on the server", () => {
  it("serves two requests with no shared toast state", () => {
    // Each render builds its own manager, so a toast raised during one request can never leak into
    // another. With a module-level manager both renders would share one queue.
    function RaiseDuringRender({ title }: { readonly title: string }): null {
      const toast = useToast()
      toast.info(title)
      return null
    }

    const first = renderToString(
      <ToastProvider>
        <RaiseDuringRender title="Request one" />
      </ToastProvider>,
    )
    const second = renderToString(
      <ToastProvider>
        <RaiseDuringRender title="Request two" />
      </ToastProvider>,
    )

    expect(first).not.toContain("Request two")
    expect(second).not.toContain("Request one")
  })
})
