import { describe, expect, it } from "vitest"
import { taskPageSchema } from "./task-read"

// The response validation boundary: the guard narrows the mock's decoded `unknown` body, so a
// malformed optional field, a missing pagination field, or a wrong-typed row never crosses as a
// typed `PaginatedResult<Task>`.

function validTask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "t-1",
    title: "Draft the release notes",
    status: "todo",
    priority: "high",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function validPagination(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { page: 1, pageSize: 8, total: 1, totalPages: 1, ...overrides }
}

function accepts(body: unknown): boolean {
  return !("issues" in taskPageSchema["~standard"].validate(body))
}

describe("taskPageSchema", () => {
  it("accepts a well-formed page", () => {
    expect(accepts({ data: [validTask()], pagination: validPagination() })).toBe(true)
  })

  it("accepts a row with well-typed optional fields", () => {
    const body = {
      data: [validTask({ description: "d", assigneeId: "a", tags: ["x"] })],
      pagination: validPagination(),
    }
    expect(accepts(body)).toBe(true)
  })

  it("rejects a row whose optional `tags` holds a non-string", () => {
    expect(accepts({ data: [validTask({ tags: [1] })], pagination: validPagination() })).toBe(false)
  })

  it("rejects a row whose optional `dueDate` is not a string", () => {
    expect(accepts({ data: [validTask({ dueDate: 5 })], pagination: validPagination() })).toBe(
      false,
    )
  })

  it("rejects a page missing required pagination fields", () => {
    expect(accepts({ data: [validTask()], pagination: { page: 1, total: 1 } })).toBe(false)
  })

  it("rejects a malformed facets block", () => {
    expect(
      accepts({
        data: [validTask()],
        pagination: validPagination(),
        facets: "not-a-count-map",
      }),
    ).toBe(false)
  })
})
