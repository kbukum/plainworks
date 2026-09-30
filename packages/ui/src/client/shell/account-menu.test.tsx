// @vitest-environment jsdom

import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AccountMenu, AccountMenuItem, AccountMenuSeparator } from "./account-menu"

afterEach(cleanup)

describe("AccountMenu", () => {
  it("names its trigger after the user and lists the given actions", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AccountMenu name="ada lovelace">
        <AccountMenuItem onSelect={() => undefined}>Account settings</AccountMenuItem>
        <AccountMenuSeparator />
        <AccountMenuItem onSelect={() => undefined} destructive>
          Log out
        </AccountMenuItem>
      </AccountMenu>,
    )
    const trigger = screen.getByRole("button", { name: "Signed in as ada lovelace" })
    expect(trigger.textContent).toContain("A")
    await expectNoAxeViolations(container)

    await user.click(trigger)
    expect(await screen.findByRole("menuitem", { name: "Account settings" })).toBeDefined()
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeDefined()
    await expectNoAxeViolations(screen.getByRole("menu"))
  })

  it("runs an action from the keyboard", async () => {
    const user = userEvent.setup()
    const logOut = vi.fn()
    render(
      <AccountMenu name="Ada">
        <AccountMenuItem onSelect={logOut}>Log out</AccountMenuItem>
      </AccountMenu>,
    )
    await user.tab()
    await user.keyboard("{Enter}")
    await screen.findByRole("menuitem", { name: "Log out" })
    await user.keyboard("{ArrowDown}{Enter}")
    expect(logOut).toHaveBeenCalledOnce()
  })

  it("takes injected labels and a custom avatar", () => {
    render(
      <AccountMenu
        name="Ada"
        avatar={<span data-testid="picture" />}
        labels={{ signedInAs: "Angemeldet als" }}
      >
        <AccountMenuItem onSelect={() => undefined}>Abmelden</AccountMenuItem>
      </AccountMenu>,
    )
    expect(screen.getByRole("button", { name: "Angemeldet als Ada" })).toBeDefined()
    expect(screen.getByTestId("picture")).toBeDefined()
  })

  it("shows the name only when the shell header has room", () => {
    render(
      <AccountMenu name="Ada">
        <AccountMenuItem onSelect={() => undefined}>Log out</AccountMenuItem>
      </AccountMenu>,
    )
    const name = screen.getByText("Ada").parentElement
    expect(name?.className).toContain("sr-only")
    expect(name?.className).toContain("@lg/shell:not-sr-only")
  })
})
