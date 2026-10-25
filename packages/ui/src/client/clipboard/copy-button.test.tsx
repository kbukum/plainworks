// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CopyButton } from "./copy-button"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("CopyButton", () => {
  it("copies the text and confirms in place and in the status region", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue()
    const { container } = render(<CopyButton text="runlabctl compare" context="command" />)
    await expectNoAxeViolations(container)

    await user.click(screen.getByRole("button", { name: "Copy command" }))
    expect(writeText).toHaveBeenCalledWith("runlabctl compare")
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied command" })).toBeDefined(),
    )
    expect(screen.getByRole("status").textContent).toBe("Copied")
  })

  it("announces a refused write", async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    )
    render(<CopyButton text="x" labels={{ copy: "Kopieren", failed: "Nicht kopiert" }} />)
    await user.click(screen.getByRole("button", { name: "Kopieren" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Nicht kopiert"))
  })
})
