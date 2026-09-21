"use client"

import type { User } from "@plainworks/demo"
import { Avatar, AvatarFallback } from "@plainworks/elements/avatar"
import { Badge } from "@plainworks/elements/badge"
import { DateValue } from "@plainworks/ui/display"
import { Modal } from "@plainworks/ui/overlays"
import type { ReactElement, ReactNode } from "react"
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from "../../app/constants"
import {
  USER_ROLE_LABEL,
  USER_ROLE_TONE,
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
function ProfileField({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

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
            <Badge variant={USER_ROLE_TONE[user.role]}>{USER_ROLE_LABEL[user.role]}</Badge>
            <Badge variant={USER_STATUS_TONE[user.status]}>{USER_STATUS_LABEL[user.status]}</Badge>
            <Badge variant={user.verified ? "default" : "outline"}>
              {user.verified ? "Verified" : "Unverified"}
            </Badge>
          </div>
        </div>

        <dl className="grid gap-4 @sm:grid-cols-2">
          <ProfileField label="Email">{user.email}</ProfileField>
          <ProfileField label="Department">{user.department ?? "—"}</ProfileField>
          {user.age === undefined ? null : <ProfileField label="Age">{user.age}</ProfileField>}
          {user.score === undefined ? null : (
            <ProfileField label="Score">{user.score}</ProfileField>
          )}
          <ProfileField label="Member since">
            <DateValue
              value={user.createdAt}
              locale={DISPLAY_LOCALE}
              timeZone={DISPLAY_TIME_ZONE}
            />
          </ProfileField>
          <ProfileField label="Last active">
            {user.lastLoginAt === undefined ? (
              "Never"
            ) : (
              <DateValue
                value={user.lastLoginAt}
                locale={DISPLAY_LOCALE}
                timeZone={DISPLAY_TIME_ZONE}
              />
            )}
          </ProfileField>
        </dl>
      </div>
    </Modal>
  )
}
