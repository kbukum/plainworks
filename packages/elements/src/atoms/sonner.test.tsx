// @vitest-environment jsdom

import { fakeStateSource } from "@plainworks/testkit"
import { expectNoAxeViolations, installMatchMedia } from "@plainworks/testkit/client"
import { ThemeProvider } from "@plainworks/theme/client"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Toaster } from "@/atoms/sonner"

beforeEach(() => installMatchMedia(false))
afterEach(cleanup)

// The toast host reads the active theme through `useTheme`, so it only renders inside a
// `ThemeProvider`; the theme source is a testkit fake, never a hand-rolled stub.
function Example() {
  return (
    <ThemeProvider source={fakeStateSource()}>
      <Toaster />
    </ThemeProvider>
  )
}

describe("Toaster", () => {
  it("mounts an accessible notifications region with no axe violations", async () => {
    const { container } = render(<Example />)
    expect(screen.getByRole("region")).toBeDefined()
    await expectNoAxeViolations(container)
  })
})
