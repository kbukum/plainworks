// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Pagination } from "./pagination"

afterEach(cleanup)

describe("Pagination", () => {
  it("disables previous on the first page and reports the requested page", async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const { container } = render(
      <Pagination page={1} pageSize={10} total={95} onPageChange={onPageChange} />,
    )

    expect(
      screen.getByRole("button", { name: "Go to previous page" }).hasAttribute("disabled"),
    ).toBe(true)
    await user.click(screen.getByRole("button", { name: "Go to page 3" }))
    expect(onPageChange).toHaveBeenCalledWith(3)
    await user.click(screen.getByRole("button", { name: "Go to next page" }))
    expect(onPageChange).toHaveBeenCalledWith(2)
    await expectNoAxeViolations(container)
  })

  it("marks the active page and never re-selects it", async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    render(<Pagination page={3} pageSize={10} total={95} onPageChange={onPageChange} />)

    const current = screen.getByRole("button", { name: /Go to page 3, current page/ })
    expect(current.getAttribute("aria-current")).toBe("page")
    await user.click(current)
    expect(onPageChange).not.toHaveBeenCalled()
  })

  it("disables next on the last page", () => {
    render(<Pagination page={10} pageSize={10} total={95} onPageChange={vi.fn()} />)
    expect(screen.getByRole("button", { name: "Go to next page" }).hasAttribute("disabled")).toBe(
      true,
    )
  })

  it("renders a sane single page when numeric props are non-finite", () => {
    render(
      <Pagination
        page={Number.NaN}
        pageSize={Number.NaN}
        total={Number.NaN}
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: /Go to page 1/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /NaN/ })).toBeNull()
    expect(
      screen.getByRole("button", { name: "Go to previous page" }).hasAttribute("disabled"),
    ).toBe(true)
    expect(screen.getByRole("button", { name: "Go to next page" }).hasAttribute("disabled")).toBe(
      true,
    )
  })
})
