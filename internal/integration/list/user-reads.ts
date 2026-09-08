// The users list endpoint read through its validation boundary, shared by every list scenario: the
// mock's decoded `unknown` body is narrowed to the typed envelope by a Standard Schema at the
// `client.get` seam — the same validation path a consumer uses — so a malformed mock response fails
// the read instead of being trusted by an unchecked cast.

import { buildListQuery, type createHttpClient } from "@plainworks/http"
import type { User, UserDepartment, UserRole, UserStatus } from "@plainworks/mocks"
import type { CursorResult, Facets, ListQueryParams, PaginatedResult } from "@plainworks/query"
import {
  isNonEmptyString,
  isRecord,
  type StandardSchemaV1,
  type WebAbortSignal,
} from "@plainworks/std"
import { guardSchema } from "@plainworks/testkit"

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

function isOneOf<T>(value: unknown, options: readonly T[]): value is T {
  return options.some((option) => option === value)
}

/** An absent optional field is fine; a present one must carry its declared type. */
function optional(value: unknown, check: (present: unknown) => boolean): boolean {
  return value === undefined || check(value)
}

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
    optional(value.name, isNonEmptyString) &&
    optional(value.firstName, isNonEmptyString) &&
    optional(value.lastName, isNonEmptyString) &&
    optional(value.avatar, isNonEmptyString) &&
    optional(value.department, (v) => isOneOf(v, USER_DEPARTMENTS)) &&
    optional(value.age, (v) => typeof v === "number") &&
    optional(value.score, (v) => typeof v === "number") &&
    optional(value.verified, (v) => typeof v === "boolean") &&
    optional(value.lastLoginAt, (v) => typeof v === "string")
  )
}

/** The optional `facets` block — per field, per value, a count. */
function isFacets(value: unknown): value is Facets {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (counts) =>
        isRecord(counts) && Object.values(counts).every((count) => typeof count === "number"),
    )
  )
}

const userPageSchema: StandardSchemaV1<unknown, PaginatedResult<User>> = guardSchema(
  (value): value is PaginatedResult<User> =>
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isUserRow) &&
    isRecord(value.pagination) &&
    typeof value.pagination.page === "number" &&
    typeof value.pagination.pageSize === "number" &&
    typeof value.pagination.total === "number" &&
    typeof value.pagination.totalPages === "number" &&
    optional(value.facets, isFacets),
  "response is not a PaginatedResult<User>",
)

const userCursorSchema: StandardSchemaV1<unknown, CursorResult<User>> = guardSchema(
  (value): value is CursorResult<User> =>
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isUserRow) &&
    isRecord(value.pagination) &&
    typeof value.pagination.pageSize === "number" &&
    (typeof value.pagination.nextCursor === "string" || value.pagination.nextCursor === null) &&
    (typeof value.pagination.prevCursor === "string" || value.pagination.prevCursor === null) &&
    optional(value.facets, isFacets),
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
