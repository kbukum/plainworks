/**
 * User-related types
 */

/** Roles a user can hold. */
export type UserRole = "admin" | "user" | "editor" | "viewer" | "moderator"
/** Lifecycle states of a user account. */
export type UserStatus = "active" | "inactive" | "pending" | "suspended"
/** Departments a user can belong to. */
export type UserDepartment =
  | "Engineering"
  | "Marketing"
  | "Sales"
  | "Support"
  | "Design"
  | "Finance"
  | "HR"
  | "Legal"
  | "Operations"
  | "Product"

/** A user entity. */
export interface User {
  id: string
  email: string
  /** Combined display name (both name formats are provided for flexibility). */
  name?: string
  firstName?: string
  lastName?: string
  avatar?: string
  department?: UserDepartment
  role: UserRole
  status: UserStatus
  /** Age of the user (numeric field for filtering/sorting). */
  age?: number
  /** User score/rating 0-100 (numeric field for filtering/sorting). */
  score?: number
  /** Whether the user has a verified email. */
  verified?: boolean
  /** Last login timestamp. */
  lastLoginAt?: string | undefined
  createdAt: string
  updatedAt: string
}

/** Client input for creating a user. */
export interface CreateUserInput {
  email: string
  name?: string
  firstName?: string
  lastName?: string
  department?: UserDepartment
  role?: UserRole
  status?: UserStatus
  /** Age override (generated randomly when omitted). */
  age?: number
  /** Score override (generated randomly when omitted). */
  score?: number
  /** Verified flag override (generated randomly when omitted). */
  verified?: boolean
}

/** Client input for updating a user. */
export interface UpdateUserInput {
  email?: string
  name?: string
  firstName?: string
  lastName?: string
  department?: UserDepartment
  role?: UserRole
  status?: UserStatus
}
