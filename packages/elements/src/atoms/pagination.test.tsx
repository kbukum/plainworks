// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/atoms/pagination"

afterEach(cleanup)

function Example() {
  return (
    <Pagination aria-label="Search results pages">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="/search?page=1" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="/search?page=1">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="/search?page=2" isActive>
            2
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis />
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="/search?page=3" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

describe("Pagination", () => {
  it("renders a named navigation landmark with page links", () => {
    render(<Example />)

    expect(screen.getByRole("navigation", { name: "Search results pages" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "1" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "2" })).toBeTruthy()
  })

  it("marks the active page as current", () => {
    render(<Example />)

    expect(screen.getByRole("link", { name: "2" }).getAttribute("aria-current")).toBe("page")
  })

  it("exposes named previous and next links", async () => {
    const user = userEvent.setup()
    render(<Example />)

    const previous = screen.getByRole("link", { name: "Go to previous page" })
    const next = screen.getByRole("link", { name: "Go to next page" })

    expect(previous.getAttribute("href")).toBe("/search?page=1")
    expect(next.getAttribute("href")).toBe("/search?page=3")
    await user.tab()
    expect(previous).toBe(document.activeElement)
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
