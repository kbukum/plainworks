"use client"

import type { User } from "@plainworks/demo"
import { Avatar, AvatarFallback } from "@plainworks/elements/avatar"
import { Badge } from "@plainworks/elements/badge"
import { DateValue } from "@plainworks/ui/display/date-value"
import { DescriptionItem, DescriptionList } from "@plainworks/ui/display/description-list"
import { StatusBadge } from "@plainworks/ui/display/status-badge"
import { Modal } from "@plainworks/ui/overlays/modal"
import type { ReactElement } from "react"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../neutral/constants"
import {
  USER_ROLE_LABEL,
  USER_STATUS_LABEL,
  USER_STATUS_TONE,
  userDisplayName,
  userInitials,
} from "./user-fields"

/** Props for {@link UserProfile}. */
export interface UserProfileProps {
  /** The user to profile, or `undefined` when nothing is selected (the overlay stays closed). */
  readonly user: User | undefined
  /** Requested open-state change (close on backdrop, escape, or the close control). */
  readonly onOpenChange: (open: boolean) => void
}

/** One labelled profile field rendered as a description-list pair. */
/**
 * The member profile overlay: a labelled {@link Modal} leading with the avatar, name, and role and
 * status badges, then a description list of contact, department, verification, and activity —
 * member-since and last-seen dates through the SSR-stable {@link DateValue}. Read-only: the
 * directory profiles a member rather than editing them.
 */
export function UserProfile({ user, onOpenChange }: UserProfileProps): ReactElement | null {
  if (user === undefined) {
    return null
  }
  const name = userDisplayName(user)
  return (
    <Modal open onOpenChange={onOpenChange} title={name} description={user.email}>
      <div className="@container grid gap-5">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            <AvatarFallback className="text-foreground">{userInitials(user)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{USER_ROLE_LABEL[user.role]}</Badge>
            <StatusBadge tone={USER_STATUS_TONE[user.status]}>
              {USER_STATUS_LABEL[user.status]}
            </StatusBadge>
            <StatusBadge tone={user.verified ? "success" : "neutral"}>
              {user.verified ? "Verified" : "Unverified"}
            </StatusBadge>
          </div>
        </div>

        <DescriptionList>
          <DescriptionItem term="Email">{user.email}</DescriptionItem>
          <DescriptionItem term="Department">{user.department ?? "—"}</DescriptionItem>
          {user.age === undefined ? null : <DescriptionItem term="Age">{user.age}</DescriptionItem>}
          {user.score === undefined ? null : (
            <DescriptionItem term="Score">{user.score}</DescriptionItem>
          )}
          <DescriptionItem term="Member since">
            <DateValue
              value={user.createdAt}
              locale={DISPLAY_LOCALE}
              timeZone={DISPLAY_TIME_ZONE}
            />
          </DescriptionItem>
          <DescriptionItem term="Last active">
            {user.lastLoginAt === undefined ? (
              "Never"
            ) : (
              <DateValue
                value={user.lastLoginAt}
                locale={DISPLAY_LOCALE}
                timeZone={DISPLAY_TIME_ZONE}
              />
            )}
          </DescriptionItem>
        </DescriptionList>
      </div>
    </Modal>
  )
}
