// @vitest-environment jsdom
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import type { AnchorHTMLAttributes, ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// The Next runtime is not mounted in the test host, so `next/link` stands in as a plain anchor.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { HostOverview } = await import("./host-overview")

afterEach(cleanup)

describe("host overview", () => {
  it("names what the host proves and links into the gated tasks view", () => {
    render(<HostOverview />)
    const section = screen.getByRole("region", { name: "One kit, two hosts" })
    expect(within(section).getAllByRole("listitem").length).toBeGreaterThan(0)
    expect(within(section).getByRole("link", { name: "Open tasks" }).getAttribute("href")).toBe(
      "/tasks",
    )
  })

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<HostOverview />)
    await expectNoAxeViolations(container)
  })
})
