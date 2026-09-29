"use client"

import { Callout } from "@plainworks/ui/feedback/callout"
import { Section } from "@plainworks/ui/layout/section"
import type { ReactElement } from "react"
import { Can, canManageAccount, useIdentity } from "./session"

/** The signed-in identity as a short description list. */
function Profile(): ReactElement {
  const identity = useIdentity()
  const name = typeof identity?.claims.name === "string" ? identity.claims.name : undefined
  return (
    <Section title="Profile" description="The identity this session is signed in with.">
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{name ?? "Not provided"}</dd>
        <dt className="text-muted-foreground">User ID</dt>
        <dd className="wrap-anywhere">{identity?.subject ?? "Not provided"}</dd>
      </dl>
    </Section>
  )
}

/**
 * The account panel, gated by the same authorization decision as the account menu link that
 * reveals it, so a caller who lacks the claim sees why instead of the profile. The route already
 * enforced the session gate on the server; this second gate shows the client `Can` and the server
 * session gate composing on one page.
 */
export function AccountPanel(): ReactElement {
  return (
    <Can
      authorizer={canManageAccount}
      action="account:manage"
      fallback={
        <Callout tone="warning" title="No access">
          You do not have access to account settings.
        </Callout>
      }
    >
      <Profile />
    </Can>
  )
}
