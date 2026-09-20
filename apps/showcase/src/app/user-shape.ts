// The `User` runtime shape in one server-safe place — the role, status, and department vocabularies
// and a sound type guard the directory list read narrows through, so a malformed row can never
// cross as a typed `User`. Neutral: it names no host global.

import type { User, UserDepartment, UserRole, UserStatus } from "@plainworks/demo"
import { isAbsentOr, isNonEmptyString, isOneOf, isRecord } from "@plainworks/std"

/** Every user role. */
export const USER_ROLES: readonly UserRole[] = ["admin", "user", "editor", "viewer", "moderator"]

/** Every account status, active first. */
export const USER_STATUSES: readonly UserStatus[] = ["active", "inactive", "pending", "suspended"]

/** Every department a user can belong to. */
export const USER_DEPARTMENTS: readonly UserDepartment[] = [
  "Engineering",
  "Marketing",
  "Sales",
  "Support",
  "Design",
  "Finance",
  "HR",
  "Legal",
  "Operations",
  "Product",
]

/**
 * A sound {@link User} guard: required id/email present, a role and status drawn from their enums,
 * and every optional identity, department, and metric field type-checked when present.
 */
export function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.email) &&
    isOneOf(value.role, USER_ROLES) &&
    isOneOf(value.status, USER_STATUSES) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isAbsentOr(value.name, (v) => typeof v === "string") &&
    isAbsentOr(value.firstName, (v) => typeof v === "string") &&
    isAbsentOr(value.lastName, (v) => typeof v === "string") &&
    isAbsentOr(value.avatar, (v) => typeof v === "string") &&
    isAbsentOr(value.department, (v) => isOneOf(v, USER_DEPARTMENTS)) &&
    isAbsentOr(value.age, (v) => typeof v === "number") &&
    isAbsentOr(value.score, (v) => typeof v === "number") &&
    isAbsentOr(value.verified, (v) => typeof v === "boolean") &&
    isAbsentOr(value.lastLoginAt, (v) => typeof v === "string")
  )
}
