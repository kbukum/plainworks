"use client"

import type { User } from "@plainworks/demo"
import { Avatar, AvatarFallback } from "@plainworks/elements/avatar"
import { Badge } from "@plainworks/elements/badge"
import { Button } from "@plainworks/elements/button"
import type { DataTableColumn } from "@plainworks/ui/data-table"
import {
  USER_ROLE_LABEL,
  USER_ROLE_TONE,
  USER_STATUS_LABEL,
  USER_STATUS_TONE,
  userDisplayName,
  userInitials,
} from "./user-fields"

/** Options for {@link userColumns}. */
export interface UserColumnsOptions {
  /** Open the user's profile overlay. */
  readonly onView: (user: User) => void
}

/**
 * The directory columns: an identity cell pairing an initials avatar with the member's name and
 * email, a toned role badge, the department, a toned status badge (the label carries the state, not
 * colour alone), and a per-row action opening the full profile. Sortable columns match the
 * backend's sort keys.
 */
export function userColumns({ onView }: UserColumnsOptions): DataTableColumn<User>[] {
  return [
    {
      id: "name",
      header: "Member",
      sortable: true,
      cell: (user) => (
        <div className="flex items-center gap-3">
          <Avatar size="sm">
            <AvatarFallback className="text-foreground">{userInitials(user)}</AvatarFallback>
          </Avatar>
          <div className="grid">
            <span className="font-medium">{userDisplayName(user)}</span>
            <span className="text-muted-foreground text-xs">{user.email}</span>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      priority: "low",
      cell: (user) => (
        <Badge variant={USER_ROLE_TONE[user.role]}>{USER_ROLE_LABEL[user.role]}</Badge>
      ),
    },
    {
      id: "department",
      header: "Department",
      priority: "low",
      cell: (user) => user.department ?? "—",
    },
    {
      id: "status",
      header: "Status",
      priority: "low",
      cell: (user) => (
        <Badge variant={USER_STATUS_TONE[user.status]}>{USER_STATUS_LABEL[user.status]}</Badge>
      ),
    },
    {
      id: "actions",
      header: "Profile",
      align: "end",
      cell: (user) => (
        <Button variant="ghost" size="sm" onClick={() => onView(user)}>
          View
          <span className="sr-only"> profile for {userDisplayName(user)}</span>
        </Button>
      ),
    },
  ]
}
