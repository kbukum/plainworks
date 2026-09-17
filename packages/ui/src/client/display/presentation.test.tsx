// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { DateValue } from "./date-value"
import { NumberValue } from "./number-value"

afterEach(cleanup)

describe("DateValue", () => {
  it("formats an instant deterministically for the given locale and time zone", async () => {
    const { container } = render(
      <DateValue value="2024-01-15T12:00:00Z" locale="en-US" timeZone="UTC" />,
    )
    const time = container.querySelector('[data-slot="date-value"]') as HTMLTimeElement
    expect(time.getAttribute("datetime")).toBe("2024-01-15T12:00:00.000Z")
    expect(time.textContent).toBe("Jan 15, 2024")
    await expectNoAxeViolations(container)
  })

  it("renders empty and drops dateTime for an unparseable value", () => {
    const { container } = render(<DateValue value="not-a-date" locale="en-US" timeZone="UTC" />)
    const time = container.querySelector('[data-slot="date-value"]') as HTMLTimeElement
    expect(time.textContent).toBe("")
    expect(time.hasAttribute("datetime")).toBe(false)
  })

  it("rejects non-ISO date strings to preserve cross-runtime SSR stability", () => {
    const { container } = render(<DateValue value="10/12/2024" locale="en-US" timeZone="UTC" />)
    const time = container.querySelector('[data-slot="date-value"]') as HTMLTimeElement
    expect(time.textContent).toBe("")
    expect(time.hasAttribute("datetime")).toBe(false)
  })

  it("formats with granular Intl options without throwing on dateStyle collision", () => {
    const { container } = render(
      <DateValue
        value="2024-01-15T12:00:00Z"
        locale="en-US"
        timeZone="UTC"
        options={{ year: "numeric", month: "long" }}
      />,
    )
    const time = container.querySelector('[data-slot="date-value"]') as HTMLTimeElement
    expect(time.textContent).toBe("January 2024")
  })
})

describe("NumberValue", () => {
  it("formats currency from injected options", async () => {
    const { container } = render(
      <NumberValue
        value={1234.5}
        locale="en-US"
        options={{ style: "currency", currency: "USD" }}
      />,
    )
    expect(container.querySelector('[data-slot="number-value"]')?.textContent).toBe("$1,234.50")
    await expectNoAxeViolations(container)
  })
})
