import type { User } from "@plainworks/demo"
import { USER_DEPARTMENTS, USER_ROLES, USER_STATUSES } from "../../app/user-shape"
import type { FacetOption } from "../catalog"

type BadgeTone = "default" | "secondary" | "destructive" | "outline"

/** Human-readable label for each role. */
export const USER_ROLE_LABEL: Record<User["role"], string> = {
  admin: "Admin",
  user: "User",
  editor: "Editor",
  viewer: "Viewer",
  moderator: "Moderator",
}

/** Human-readable label for each account status. */
export const USER_STATUS_LABEL: Record<User["status"], string> = {
  active: "Active",
  inactive: "Inactive",
  pending: "Pending",
  suspended: "Suspended",
}

/** Badge tone per role — admin reads as solid, moderator/editor as secondary, the rest as quiet. */
export const USER_ROLE_TONE: Record<User["role"], BadgeTone> = {
  admin: "default",
  moderator: "secondary",
  editor: "secondary",
  user: "outline",
  viewer: "outline",
}

/** Badge tone per status — active reads as solid, suspended as an error, the rest as quieter. */
export const USER_STATUS_TONE: Record<User["status"], BadgeTone> = {
  active: "default",
  inactive: "outline",
  pending: "secondary",
  suspended: "destructive",
}

/** Role facet options for the shared {@link FacetPanel}. */
export const USER_ROLE_OPTIONS: readonly FacetOption[] = USER_ROLES.map((role) => ({
  value: role,
  label: USER_ROLE_LABEL[role],
}))

/** Status facet options for the shared {@link FacetPanel}. */
export const USER_STATUS_OPTIONS: readonly FacetOption[] = USER_STATUSES.map((status) => ({
  value: status,
  label: USER_STATUS_LABEL[status],
}))

/** Department facet options for the shared {@link FacetPanel}. */
export const USER_DEPARTMENT_OPTIONS: readonly FacetOption[] = USER_DEPARTMENTS.map(
  (department) => ({ value: department, label: department }),
)

/** The user's best display name — the combined name, else first/last, else the email local part. */
export function userDisplayName(user: User): string {
  if (user.name !== undefined && user.name.trim() !== "") {
    return user.name
  }
  const joined = [user.firstName, user.lastName].filter((part) => part).join(" ")
  return joined !== "" ? joined : (user.email.split("@")[0] ?? user.email)
}

/** Up to two uppercase initials for the avatar fallback, derived from the display name. */
export function userInitials(user: User): string {
  const parts = userDisplayName(user)
    .split(/\s+/)
    .filter((part) => part.length > 0)
  const initials = parts.slice(0, 2).map((part) => part[0] ?? "")
  return initials.join("").toUpperCase() || "?"
}
