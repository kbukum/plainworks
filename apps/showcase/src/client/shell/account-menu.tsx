"use client"

import { formPostNavigator } from "@plainworks/auth/form-post"
import {
  AccountMenuItem,
  AccountMenuSeparator,
  AccountMenu as KitAccountMenu,
} from "@plainworks/ui/shell/account-menu"
import type { ReactElement } from "react"
import { Can, canManageAccount, useIdentity, useSessionRuntime } from "../auth"
import { useRouter } from "../router"

/**
 * The showcase's account menu: the kit menu wired to the session. The account link is gated by the
 * app's account policy; log out posts through the auth form navigator.
 */
export function AccountMenu(): ReactElement {
  const identity = useIdentity()
  const runtime = useSessionRuntime()
  const { navigate } = useRouter()
  const name =
    (typeof identity?.claims?.name === "string" ? identity.claims.name : undefined) ??
    identity?.subject ??
    "Guest"

  return (
    <KitAccountMenu name={name}>
      <Can authorizer={canManageAccount} action="account:manage">
        <AccountMenuItem onSelect={() => navigate("/settings")}>Account settings</AccountMenuItem>
        <AccountMenuSeparator />
      </Can>
      <AccountMenuItem
        onSelect={() => {
          void runtime.logout().then(
            () => formPostNavigator.navigate("/"),
            () => formPostNavigator.navigate("/login?reason=revocation-unconfirmed"),
          )
        }}
      >
        Log out
      </AccountMenuItem>
    </KitAccountMenu>
  )
}
