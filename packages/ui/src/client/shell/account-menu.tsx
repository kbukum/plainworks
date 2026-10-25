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
  /** Shows only the avatar at every width, such as in a folded rail. The name stays for screen readers. */
  readonly compact?: boolean
  readonly className?: string
}

/**
 * The account control for the header or rail: a menu named after the signed-in user, holding the
 * actions you pass. The trigger shows the name, cut short to fit, when the `AppShell` has room, and
 * keeps it for screen readers when it does not or when `compact`, so the button is named at every
 * width. Authentication stays with the
 * caller: wire sign-out and gate items with your own session.
 */
export function AccountMenu({
  name,
  avatar,
  children,
  labels,
  compact = false,
  className,
}: AccountMenuProps): ReactElement {
  const copy = { ...defaultAccountMenuLabels, ...labels }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "min-w-0 max-w-full shrink-0 gap-2",
          !compact && "@lg/shell:w-auto @lg/shell:px-3",
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
        <span
          data-slot="account-menu-name"
          className={compact ? "sr-only" : "sr-only @lg/shell:not-sr-only @lg/shell:min-w-0"}
        >
          <span className="block truncate">
            {copy.signedInAs} <strong>{name}</strong>
          </span>
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
