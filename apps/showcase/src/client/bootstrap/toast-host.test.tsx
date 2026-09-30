// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { useToast } from "@plainworks/ui/feedback/toast"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { ToastHost } from "./toast-host"

afterEach(cleanup)

function Raiser(): ReactElement {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.success("Profile saved")}>
      Save
    </button>
  )
}

describe("ToastHost", () => {
  it("raises app toasts with the app icon in the notifications region", async () => {
    const user = userEvent.setup()
    render(
      <ToastHost>
        <Raiser />
      </ToastHost>,
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    const region = screen.getByRole("region", { name: "Notifications" })
    const toast = await within(region).findByRole("dialog")
    expect(within(toast).getByText("Profile saved")).toBeDefined()
    expect(toast.querySelector("svg.lucide-circle-check")).not.toBeNull()
    await expectNoAxeViolations(document.body)
  })
})
