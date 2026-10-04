// @vitest-environment jsdom

import { createSessionFixture } from "@plainworks/auth/testing"
import { expectNoAxeViolations } from "@plainworks/testkit/client"
import { cleanup, render, screen, waitFor, within } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { AccountPanel } from "../account"
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
        runtime={createSessionFixture({
          status: "authenticated",
          identity: { subject: "user-123", claims: { name: "Ada" } },
        })}
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
      <SessionProvider runtime={createSessionFixture()}>
        <AccountAction />
      </SessionProvider>,
    )
    await waitFor(() => expect(screen.getByText("Sign in to manage")).toBeDefined())
    expect(screen.queryByRole("button", { name: "Account settings" })).toBeNull()
  })

  it("renders the account panel for the named identity with no accessibility violations", async () => {
    const { container } = render(
      <SessionProvider
        runtime={createSessionFixture({
          status: "authenticated",
          identity: { subject: "user-123", claims: { name: "Ada" } },
        })}
      >
        <AccountPanel />
      </SessionProvider>,
    )
    const profile = await screen.findByRole("region", { name: "Profile" })
    expect(within(profile).getByText("Ada")).toBeDefined()
    expect(within(profile).getByText("user-123")).toBeDefined()
    await expectNoAxeViolations(container)
  })

  it("explains the denial to a signed-in identity the policy rejects", async () => {
    render(
      <SessionProvider
        runtime={createSessionFixture({
          status: "authenticated",
          identity: { subject: "u-9", claims: {} },
        })}
      >
        <AccountPanel />
      </SessionProvider>,
    )
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("You do not have access to account settings.")
    expect(screen.queryByRole("region", { name: "Profile" })).toBeNull()
  })
})
