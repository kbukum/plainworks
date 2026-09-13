// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/atoms/breadcrumb"

afterEach(cleanup)

function Example() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/">Home</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Settings</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

describe("Breadcrumb", () => {
  it("exposes the trail as a labelled navigation landmark", () => {
    render(<Example />)
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toBeTruthy()
  })

  it("renders ancestors as links", () => {
    render(<Example />)
    const link = screen.getByRole("link", { name: "Home" })
    expect(link.getAttribute("href")).toBe("/")
  })

  it("renders the current page as a static span with aria-current, not a link", () => {
    render(<Example />)
    // The current page is announced by position, never as an interactive link.
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull()
    const page = screen.getByText("Settings")
    expect(page.tagName).toBe("SPAN")
    expect(page.getAttribute("aria-current")).toBe("page")
    expect(page.hasAttribute("role")).toBe(false)
  })

  it("has no axe violations", async () => {
    const { container } = render(<Example />)
    await expectNoAxeViolations(container)
  })
})
