"use client"

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
import type { ReactElement, ReactNode } from "react"

/** Every user-facing string of the {@link AccountMenu}. */
export interface AccountMenuLabels {
  /** Leads the user's name on the trigger, e.g. `"Signed in as"`. */
  readonly signedInAs: string
}

/** English defaults for every {@link AccountMenuLabels} field. */
export const defaultAccountMenuLabels: AccountMenuLabels = {
  signedInAs: "Signed in as",
}

/** Props for {@link AccountMenu}. */
export interface AccountMenuProps {
  /** The signed-in user's display name. */
  readonly name: string
  /** The user's picture. Defaults to the first letter of `name`. */
  readonly avatar?: ReactNode
  /** The menu's actions: {@link AccountMenuItem}s and {@link AccountMenuSeparator}s. */
  readonly children: ReactNode
  readonly labels?: Partial<AccountMenuLabels>
  readonly className?: string
}

/**
 * The header's account control: a menu named after the signed-in user, holding the actions you
 * pass. The trigger shows the name when the `AppShell` header has room and keeps it for screen
 * readers when it does not, so the button is named at every width. Authentication stays with the
 * caller: wire sign-out and gate items with your own session.
 */
export function AccountMenu({
  name,
  avatar,
  children,
  labels,
  className,
}: AccountMenuProps): ReactElement {
  const copy = { ...defaultAccountMenuLabels, ...labels }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "shrink-0 gap-2 @lg/shell:w-auto @lg/shell:px-3",
          className,
        )}
      >
        <Avatar aria-hidden className="size-6 text-xs">
          {avatar ?? (
            <AvatarFallback className="text-foreground">
              {name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          )}
        </Avatar>
        <span className="sr-only @lg/shell:not-sr-only">
          {copy.signedInAs} <strong>{name}</strong>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Props for {@link AccountMenuItem}. */
export interface AccountMenuItemProps {
  /** Runs when the user picks the item, by pointer or keyboard. */
  readonly onSelect: () => void
  readonly children: ReactNode
  /** Styles the item as destructive, e.g. for deleting the account. */
  readonly destructive?: boolean
}

/** One action in an {@link AccountMenu}. */
export function AccountMenuItem({
  onSelect,
  children,
  destructive = false,
}: AccountMenuItemProps): ReactElement {
  return (
    <DropdownMenuItem variant={destructive ? "destructive" : "default"} onClick={onSelect}>
      {children}
    </DropdownMenuItem>
  )
}

/** A divider between groups of {@link AccountMenuItem}s. */
export function AccountMenuSeparator(): ReactElement {
  return <DropdownMenuSeparator />
}
