// @vitest-environment jsdom
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { SignInInterrupted } from "./sign-in-interrupted"

afterEach(cleanup)

describe("sign-in interrupted", () => {
  it("explains the failed sign-in and offers a fresh one", async () => {
    render(<SignInInterrupted />)
    const alert = screen.getByRole("alert")
    expect(within(alert).getByText("Sign-in didn't finish")).toBeDefined()
    expect(within(alert).getByRole("link", { name: "Sign in again" }).getAttribute("href")).toBe(
      "/login",
    )
    await expectNoAxeViolations(document.body)
  })
})
