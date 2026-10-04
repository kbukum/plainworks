"use client"

import { DescriptionItem, DescriptionList } from "@plainworks/ui/display/description-list"
import { Callout } from "@plainworks/ui/feedback/callout"
import { Section } from "@plainworks/ui/layout/section"
import type { ReactElement } from "react"
import { Can, canManageAccount, useIdentity } from "../auth"

/** The signed-in identity as a short description list. */
function Profile(): ReactElement {
  const identity = useIdentity()
  const name = typeof identity?.claims?.name === "string" ? identity.claims.name : undefined
  return (
    <Section title="Profile" description="The identity this session is signed in with.">
      <DescriptionList>
        <DescriptionItem term="Name">{name ?? "Not provided"}</DescriptionItem>
        <DescriptionItem term="User ID" className="wrap-anywhere">
          {identity?.subject ?? "Not provided"}
        </DescriptionItem>
      </DescriptionList>
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
