// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Identifier, middleTruncate } from "./identifier"

afterEach(cleanup)

const ID = "0f8e3c2a-5b7d-4e61-9a0c-3d2f1e4b5a69"

describe("middleTruncate", () => {
  it("keeps the start and end of a long value", () => {
    expect(middleTruncate(ID, 4, 4)).toBe("0f8e…5a69")
  })

  it("leaves a value that already fits", () => {
    expect(middleTruncate("abc123", 4, 4)).toBe("abc123")
    expect(middleTruncate("abcdefghi", 4, 4)).toBe("abcdefghi")
  })
})

describe("Identifier", () => {
  it("shows a truncated id, keeps the full value for screen readers, and is focusable", async () => {
    const { container } = render(<Identifier value={ID} label="run id" />)
    expect(screen.getByText("0f8e3c…5a69").getAttribute("aria-hidden")).toBe("true")
    expect(screen.getByText(ID).className).toContain("sr-only")
    expect(
      container.querySelector('[data-slot="identifier-value"]')?.getAttribute("tabindex"),
    ).toBe("0")
    await expectNoAxeViolations(container)
  })

  it("copies the full value from a named button and announces it", async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined)
    render(<Identifier value={ID} label="run id" />)
    await user.click(screen.getByRole("button", { name: "Copy run id" }))
    expect(writeText).toHaveBeenCalledWith(ID)
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Copied"))
  })

  it("can leave the copy button out", () => {
    render(<Identifier value={ID} label="run id" copy={false} />)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
