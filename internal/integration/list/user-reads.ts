// The users list endpoint read through its validation boundary, shared by every list scenario: the
// mock's decoded `unknown` body is narrowed to the typed envelope by a Standard Schema at the
// `client.get` seam — the same validation path a consumer uses — so a malformed mock response fails
// the read instead of being trusted by an unchecked cast.

import type { User, UserDepartment, UserRole, UserStatus } from "@plainworks/demo"
import { buildListQuery, type createHttpClient } from "@plainworks/http"
import type { CursorResult, ListQueryParams, PaginatedResult } from "@plainworks/query"
import {
  guardSchema,
  isAbsentOr,
  isCursorResult,
  isNonEmptyString,
  isOneOf,
  isPaginatedResult,
  isRecord,
  type StandardSchemaV1,
  type WebAbortSignal,
} from "@plainworks/std"

type HttpClient = ReturnType<typeof createHttpClient>

const USER_ROLES: readonly UserRole[] = ["admin", "user", "editor", "viewer", "moderator"]
const USER_STATUSES: readonly UserStatus[] = ["active", "inactive", "pending", "suspended"]
const USER_DEPARTMENTS: readonly UserDepartment[] = [
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

// A sound `User` guard: required fields, enum membership for role/status/department, and every
// optional field type-checked when present — a malformed row never crosses as a typed `User`.
function isUserRow(value: unknown): value is User {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.email) &&
    isOneOf(value.role, USER_ROLES) &&
    isOneOf(value.status, USER_STATUSES) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    isAbsentOr(value.name, isNonEmptyString) &&
    isAbsentOr(value.firstName, isNonEmptyString) &&
    isAbsentOr(value.lastName, isNonEmptyString) &&
    isAbsentOr(value.avatar, isNonEmptyString) &&
    isAbsentOr(value.department, (v) => isOneOf(v, USER_DEPARTMENTS)) &&
    isAbsentOr(value.age, (v) => typeof v === "number") &&
    isAbsentOr(value.score, (v) => typeof v === "number") &&
    isAbsentOr(value.verified, (v) => typeof v === "boolean") &&
    isAbsentOr(value.lastLoginAt, (v) => typeof v === "string")
  )
}

const userPageSchema: StandardSchemaV1<unknown, PaginatedResult<User>> = guardSchema(
  (value): value is PaginatedResult<User> => isPaginatedResult(value, isUserRow),
  "response is not a PaginatedResult<User>",
)

const userCursorSchema: StandardSchemaV1<unknown, CursorResult<User>> = guardSchema(
  (value): value is CursorResult<User> => isCursorResult(value, isUserRow),
  "response is not a CursorResult<User>",
)

/** Read one offset page of users, validated at the boundary. A bodyless (204) response is a read failure here — never a fabricated empty page. */
export async function readUserPage(
  client: HttpClient,
  params?: ListQueryParams,
  signal?: WebAbortSignal,
): Promise<PaginatedResult<User>> {
  const page = await client.get("/api/users", {
    ...(params ? { query: buildListQuery(params) } : {}),
    ...(signal ? { signal } : {}),
    schema: userPageSchema,
  })
  if (page === undefined) throw new Error("GET /api/users returned no body")
  return page
}

/** Read one cursor page of users, validated at the boundary; `params.cursor` selects the page (empty string = first). */
export async function readUserCursorPage(
  client: HttpClient,
  params: ListQueryParams,
  signal?: WebAbortSignal,
): Promise<CursorResult<User>> {
  const page = await client.get("/api/users", {
    query: buildListQuery(params),
    ...(signal ? { signal } : {}),
    schema: userCursorSchema,
  })
  if (page === undefined) throw new Error("GET /api/users returned no body")
  return page
}
