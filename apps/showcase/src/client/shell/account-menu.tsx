"use client"

import { logout } from "@plainworks/auth/client"
import { formPostNavigator } from "@plainworks/auth/form-post"
import {
  AccountMenuItem,
  AccountMenuSeparator,
  AccountMenu as KitAccountMenu,
} from "@plainworks/ui/shell/account-menu"
import type { ReactElement } from "react"
import { Can, canManageAccount, useIdentity } from "../auth"
import { useRouter } from "../router"

/**
 * The showcase's account menu: the kit menu wired to the session. The account link is gated by the
 * app's account policy; log out posts through the auth form navigator.
 */
export function AccountMenu(): ReactElement {
  const identity = useIdentity()
  const { navigate } = useRouter()
  const name =
    (typeof identity?.claims.name === "string" ? identity.claims.name : undefined) ??
    identity?.subject ??
    "Guest"

  return (
    <KitAccountMenu name={name}>
      <Can authorizer={canManageAccount} action="account:manage">
        <AccountMenuItem onSelect={() => navigate("/settings")}>Account settings</AccountMenuItem>
        <AccountMenuSeparator />
      </Can>
      <AccountMenuItem onSelect={() => logout({ navigator: formPostNavigator })}>
        Log out
      </AccountMenuItem>
    </KitAccountMenu>
  )
}
