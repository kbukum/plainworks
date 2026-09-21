// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { StatCards } from "./stat-cards"

afterEach(cleanup)

describe("StatCards", () => {
  it("presents zero growth as no change", async () => {
    const { container } = render(
      <StatCards
        stats={{
          totalUsers: 10,
          totalOrders: 20,
          totalRevenue: 30,
          totalProducts: 40,
          userGrowth: 0,
          orderGrowth: 0,
          revenueGrowth: 0,
        }}
      />,
    )

    expect(screen.getAllByText(/no change from last period/)).toHaveLength(3)
    expect(screen.queryByText(/increase from last period/)).toBeNull()
    await expectNoAxeViolations(container)
  })

  it("presents positive and negative deltas with text and icons", async () => {
    const { container } = render(
      <StatCards
        stats={{
          totalUsers: 10,
          totalOrders: 20,
          totalRevenue: 30,
          totalProducts: 40,
          userGrowth: 5,
          orderGrowth: -3,
          revenueGrowth: 2,
        }}
      />,
    )

    expect(screen.getAllByText(/increase from last period/)).toHaveLength(2)
    expect(screen.getByText(/decrease from last period/)).toBeDefined()
    expect(container.querySelectorAll("svg[aria-hidden='true']").length).toBeGreaterThanOrEqual(3)
    await expectNoAxeViolations(container)
  })
})
