// The users list endpoint read through its validation boundary, shared by every list scenario. The
// offset read is the kit's `httpListQuery`; the cursor read narrows the body with a Standard Schema
// at the `client.get` seam. Either way a malformed mock response fails the read instead of being
// trusted by an unchecked cast.

import type { User, UserDepartment, UserRole, UserStatus } from "@plainworks/demo"
import type { createHttpClient } from "@plainworks/http"
import { buildListQuery } from "@plainworks/http/list"
import { type HttpListQuery, httpListQuery } from "@plainworks/query/http-list"
import { isAbsentOr, isNonEmptyString, isOneOf, isRecord } from "@plainworks/std"
import type { CursorResult, ListQueryParams } from "@plainworks/std/list"
import { isCursorResult } from "@plainworks/std/list"
import { guardSchema, type StandardSchemaV1 } from "@plainworks/std/seam"
import type { WebAbortSignal } from "@plainworks/std/web"

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

const userCursorSchema: StandardSchemaV1<unknown, CursorResult<User>> = guardSchema(
  (value): value is CursorResult<User> => isCursorResult(value, isUserRow),
  "response is not a CursorResult<User>",
)

/** The users offset list through the kit's validated HTTP list reader. */
export const userList: HttpListQuery<User> = httpListQuery<User>({
  path: "/api/users",
  resource: "users",
  row: isUserRow,
})

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
