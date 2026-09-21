"use client"

import { logout } from "@plainworks/auth/client"
import { Avatar, AvatarFallback } from "@plainworks/elements/avatar"
import { buttonVariants } from "@plainworks/elements/button"
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
import type { ReactElement } from "react"
import { useRouter } from "../router"
import { Can, canManageAccount, useIdentity } from "../session"

/**
 * The account menu — the signed-in identity plus its actions. The trigger always names the current
 * user (visually on wide viewports, screen-reader-only when the header is tight) so the button has
 * an accessible name at every width. The menu holds the account link (authorization-gated by the
 * app's account policy) and log out.
 */
export function AccountMenu(): ReactElement {
  const identity = useIdentity()
  const { navigate } = useRouter()
  const name =
    (typeof identity?.claims.name === "string" ? identity.claims.name : undefined) ??
    identity?.subject ??
    "Guest"
  const initial = name.slice(0, 1).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "relative shrink-0 @lg/shell:w-auto @lg/shell:px-3 gap-2",
        )}
      >
        <Avatar aria-hidden className="size-6 text-xs">
          <AvatarFallback className="text-foreground">{initial}</AvatarFallback>
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
          <DropdownMenuItem onClick={() => navigate("/settings")}>
            Account settings
          </DropdownMenuItem>
        </Can>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
