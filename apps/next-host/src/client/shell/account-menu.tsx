"use client"

import { login } from "@plainworks/auth/client"
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
import {
  Can,
  canManageAccount,
  useIdentity,
  useIsAuthenticated,
  useSession,
  useSessionRuntime,
} from "../auth"

/**
 * The header's account control. A guest gets a Sign in button. A signed-in user gets the kit
 * account menu, holding the authorization-gated account link and log out.
 */
export function AccountMenu(): ReactElement {
  const identity = useIdentity()
  const authenticated = useIsAuthenticated()
  const runtime = useSessionRuntime()
  const snapshot = useSession()
  const router = useRouter()

  if (!authenticated) {
    return (
      <div>
        <Button
          size="sm"
          onClick={() => login({ navigator: formPostNavigator, returnTo: TASKS_PATH })}
        >
          Sign in
        </Button>
        {snapshot.revocation === "unconfirmed" ? (
          <p role="alert">Signed out locally. Server sign-out could not be confirmed.</p>
        ) : null}
      </div>
    )
  }

  const name =
    (typeof identity?.claims?.name === "string" ? identity.claims.name : undefined) ??
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
      <AccountMenuItem
        onSelect={() => {
          void runtime.logout().then(
            () => formPostNavigator.navigate("/"),
            () => {},
          )
        }}
      >
        Log out
      </AccountMenuItem>
    </KitAccountMenu>
  )
}
