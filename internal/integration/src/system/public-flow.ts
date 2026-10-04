import { defineFlow, type Flow, type RunningGateHost } from "@plainworks/testkit/playwright"
import { expect } from "@playwright/test"

export function publicHostFlow(host?: RunningGateHost): Flow {
  const owned = (): RunningGateHost => {
    if (host === undefined)
      throw new Error("Outage/restart requires an owned host, not warm reuse.")
    return host
  }
  return defineFlow({
    name: "public-host-outage-recovery",
    covers: ["packages/testkit/src/playwright/**", "internal/integration/src/host/**"],
    checkpoints: [
      {
        name: "available",
        act: async (page, { signal }) => {
          await page.goto("/", { signal })
          await page.getByRole("button", { name: "Check host" }).focus()
        },
        ready: (page) => page.getByRole("status").filter({ hasText: /^Available$/ }),
        checks: { hydration: false, focus: true },
      },
      {
        name: "unavailable",
        act: async (page, { signal }) => {
          await owned().stop()
          await page.getByRole("button", { name: "Check host" }).click({ signal })
          await expect(page.getByRole("status")).toHaveText("Unavailable")
        },
        ready: (page) => page.getByRole("status").filter({ hasText: /^Unavailable$/ }),
        checks: { hydration: false },
        allow: [
          {
            check: "runtime",
            match: /net::ERR_CONNECTION_REFUSED/,
            reason: "The owned process is deliberately stopped; the UI must show its outage.",
          },
        ],
      },
      {
        name: "recovered",
        act: async (page, { signal }) => {
          await owned().restart()
          await page.getByRole("button", { name: "Check host" }).click({ signal })
          await expect(page.getByRole("status")).toHaveText("Available")
        },
        ready: (page) => page.getByRole("status").filter({ hasText: /^Available$/ }),
        checks: { hydration: false },
      },
    ],
  })
}
