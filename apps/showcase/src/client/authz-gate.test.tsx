// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { Can, canManageAccount, SessionProvider } from "./session"

// Proves the app's authorization wiring end to end: the real `createAllowListPolicy` policy, the
// `Can` gate, and the shared `SessionProvider` together decide whether the account affordance is
// shown — default-deny for a guest, allowed for the named demo identity.

afterEach(cleanup)

function AccountAction(): ReactNode {
  return (
    <Can authorizer={canManageAccount} action="account:manage" fallback={<p>Sign in to manage</p>}>
      <button type="button">Account settings</button>
    </Can>
  )
}

describe("showcase account authorization", () => {
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
})
