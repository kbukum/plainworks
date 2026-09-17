"use client"

import type { ReactElement } from "react"
import { Can, canManageAccount } from "./session"

/**
 * The account panel — gated by the same authorization decision as the affordance that reveals it,
 * so a caller who lacks the claim sees the fallback rather than the controls. The route already
 * enforced the session gate server-side; this second gate proves the client `Can` and the server
 * session gate compose on one page.
 */
export function AccountPanel(): ReactElement {
  return (
    <Can
      authorizer={canManageAccount}
      action="account:manage"
      fallback={<p role="alert">You do not have access to account settings.</p>}
    >
      <section aria-labelledby="account-heading">
        <h2 id="account-heading">Manage your account</h2>
        <p>
          You are signed in with an identity that carries a name, so the account controls are
          available. The panel is gated by the same policy as its navigation affordance.
        </p>
      </section>
    </Can>
  )
}
