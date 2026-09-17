// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import axe from "axe-core"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { AccountPanel } from "./account-panel"
import { Can, canManageAccount, SessionProvider } from "./session"

// The account gate end to end: the real `createAllowListPolicy`, the `Can` gate, and the shared
// `SessionProvider` decide whether the account controls show — default-deny for a guest, allowed
// for the named identity. The same policy backs the panel the gated `/account` route renders.

afterEach(cleanup)

function AccountAction(): ReactNode {
  return (
    <Can authorizer={canManageAccount} action="account:manage" fallback={<p>Sign in to manage</p>}>
      <button type="button">Account settings</button>
    </Can>
  )
}

describe("account authorization", () => {
  it("shows the account action for the authenticated named identity", async () => {
    render(
      <SessionProvider
        initialSnapshot={{
          status: "authenticated",
          identity: { subject: "user-123", claims: { name: "Ada" } },
        }}
      >
        <AccountAction />
      </SessionProvider>,
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Account settings" })).toBeDefined(),
    )
  })

  it("denies the account action for a guest by default", async () => {
    render(
      <SessionProvider>
        <AccountAction />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByText("Sign in to manage")).toBeDefined())
    expect(screen.queryByRole("button", { name: "Account settings" })).toBeNull()
  })

  it("renders the account panel for the named identity with no accessibility violations", async () => {
    const { container } = render(
      <SessionProvider
        initialSnapshot={{
          status: "authenticated",
          identity: { subject: "user-123", claims: { name: "Ada" } },
        }}
      >
        <AccountPanel />
      </SessionProvider>,
    )
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Manage your account" })).toBeDefined(),
    )
    const results = await axe.run(container)
    expect(results.violations).toEqual([])
  })
})
