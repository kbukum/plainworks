"use client"

import { login, logout } from "@plainworks/auth/client"
import { formPostNavigator } from "@plainworks/auth/form-post"
import { Avatar, AvatarFallback } from "@plainworks/elements/avatar"
import { Button, buttonVariants } from "@plainworks/elements/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@plainworks/elements/dropdown-menu"
import { cn } from "@plainworks/theme"
import { useRouter } from "next/navigation"
import type { ReactElement } from "react"
import { ACCOUNT_PATH, TASKS_PATH } from "../neutral/constants"
import { Can, canManageAccount, useIdentity, useIsAuthenticated } from "./session"

/**
 * The header's account control. A guest gets a Sign in button. A signed-in user gets a menu named
 * after them (the name shows when the header has room and stays screen-reader-only otherwise),
 * holding the authorization-gated account link and log out.
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
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "shrink-0 gap-2 @lg/shell:w-auto @lg/shell:px-3",
        )}
      >
        <Avatar aria-hidden className="size-6 text-xs">
          <AvatarFallback className="text-foreground">
            {name.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="sr-only @lg/shell:not-sr-only">
          Signed in as <strong>{name}</strong>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <Can authorizer={canManageAccount} action="account:manage">
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push(ACCOUNT_PATH)}>
            Account settings
          </DropdownMenuItem>
        </Can>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout({ navigator: formPostNavigator })}>
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
