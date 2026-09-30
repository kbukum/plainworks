"use client"

import { login, logout } from "@plainworks/auth/client"
import { formPostNavigator } from "@plainworks/auth/form-post"
import { Button } from "@plainworks/elements/button"
import {
  AccountMenuItem,
  AccountMenuSeparator,
  AccountMenu as KitAccountMenu,
} from "@plainworks/ui/shell/account-menu"
import { useRouter } from "next/navigation"
import type { ReactElement } from "react"
import { ACCOUNT_PATH, TASKS_PATH } from "../../neutral/constants"
import { Can, canManageAccount, useIdentity, useIsAuthenticated } from "../auth"

/**
 * The header's account control. A guest gets a Sign in button. A signed-in user gets the kit
 * account menu, holding the authorization-gated account link and log out.
 */
export function AccountMenu(): ReactElement {
  const identity = useIdentity()
  const authenticated = useIsAuthenticated()
  const router = useRouter()

  if (!authenticated) {
    return (
      <Button
        size="sm"
        onClick={() => login({ navigator: formPostNavigator, returnTo: TASKS_PATH })}
      >
        Sign in
      </Button>
    )
  }

  const name =
    (typeof identity?.claims.name === "string" ? identity.claims.name : undefined) ??
    identity?.subject ??
    "Account"

  return (
    <KitAccountMenu name={name}>
      <Can authorizer={canManageAccount} action="account:manage">
        <AccountMenuItem onSelect={() => router.push(ACCOUNT_PATH)}>
          Account settings
        </AccountMenuItem>
        <AccountMenuSeparator />
      </Can>
      <AccountMenuItem onSelect={() => logout({ navigator: formPostNavigator })}>
        Log out
      </AccountMenuItem>
    </KitAccountMenu>
  )
}
