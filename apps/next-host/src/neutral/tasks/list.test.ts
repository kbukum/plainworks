import { describe, expect, it } from "vitest"
import { isTaskRow } from "./list"

// The row guard: a malformed required or optional field never crosses as a typed `Task`. The page
// envelope itself is checked by the kit's list reader.

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

describe("isTaskRow", () => {
  it("accepts a well-formed row", () => {
    expect(isTaskRow(validTask())).toBe(true)
  })

  it("accepts a row with well-typed optional fields", () => {
    expect(isTaskRow(validTask({ description: "d", assigneeId: "a", tags: ["x"] }))).toBe(true)
  })

  it("rejects a row whose optional `tags` holds a non-string", () => {
    expect(isTaskRow(validTask({ tags: [1] }))).toBe(false)
  })

  it("rejects a row whose optional `dueDate` is not a string", () => {
    expect(isTaskRow(validTask({ dueDate: 5 }))).toBe(false)
  })

  it("rejects a row with an unknown status", () => {
    expect(isTaskRow(validTask({ status: "archived" }))).toBe(false)
  })
})
