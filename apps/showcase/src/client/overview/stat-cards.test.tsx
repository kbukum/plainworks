// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatCards } from "./stat-cards"

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
})
