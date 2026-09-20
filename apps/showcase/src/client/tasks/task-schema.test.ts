import { describe, expect, it } from "vitest"
import { taskFormSchema } from "./task-schema"

describe("taskFormSchema", () => {
  const schema = taskFormSchema()["~standard"]

  it("validates and trims a complete valid input", async () => {
    const result = await schema.validate({
      title: "  Fix CI  ",
      status: "in-progress",
      priority: "high",
      description: "  Some details  ",
      dueDate: "  2024-12-31  ",
    })
    expect("value" in result).toBe(true)
    if ("value" in result) {
      expect(result.value).toEqual({
        title: "Fix CI",
        status: "in-progress",
        priority: "high",
        description: "Some details",
        dueDate: "2024-12-31",
      })
    }
  })

  it("maps blank optional fields to null", async () => {
    const result = await schema.validate({
      title: "Task title",
      status: "todo",
      priority: "low",
      description: "   ",
      dueDate: "",
    })
    expect("value" in result).toBe(true)
    if ("value" in result) {
      expect(result.value).toEqual({
        title: "Task title",
        status: "todo",
        priority: "low",
        description: null,
        dueDate: null,
      })
    }
  })

  it("rejects blank or whitespace-only title", async () => {
    const blank = await schema.validate({
      title: "",
      status: "todo",
      priority: "low",
    })
    expect("issues" in blank).toBe(true)
    if ("issues" in blank) {
      expect(blank.issues?.[0]?.path).toEqual(["title"])
      expect(blank.issues?.[0]?.message).toBe("Title is required.")
    }

    const whitespace = await schema.validate({
      title: "   \t\n  ",
      status: "todo",
      priority: "low",
    })
    expect("issues" in whitespace).toBe(true)
    if ("issues" in whitespace) {
      expect(whitespace.issues?.[0]?.path).toEqual(["title"])
    }
  })

  it("rejects invalid status", async () => {
    const result = await schema.validate({
      title: "Task",
      status: "not-a-status",
      priority: "low",
    })
    expect("issues" in result).toBe(true)
    if ("issues" in result) {
      expect(result.issues?.some((i) => i.path?.[0] === "status")).toBe(true)
    }
  })

  it("rejects invalid priority", async () => {
    const result = await schema.validate({
      title: "Task",
      status: "todo",
      priority: "urgent",
    })
    expect("issues" in result).toBe(true)
    if ("issues" in result) {
      expect(result.issues?.some((i) => i.path?.[0] === "priority")).toBe(true)
    }
  })

  it("rejects non-object input gracefully", async () => {
    const result = await schema.validate(null)
    expect("issues" in result).toBe(true)
  })
})
