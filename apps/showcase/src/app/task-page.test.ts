import type { Task } from "@plainworks/demo"
import type { PaginatedResult } from "@plainworks/query"
import { describe, expect, it } from "vitest"
import { dropTaskFromPage, reconcileTaskInPage } from "./task-page"

const samplePage: PaginatedResult<Task> = {
  data: [
    {
      id: "task-1",
      title: "First",
      status: "todo",
      priority: "medium",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "task-2",
      title: "Second",
      status: "in-progress",
      priority: "high",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    },
  ],
  pagination: { page: 1, pageSize: 2, total: 2, totalPages: 1 },
}

describe("task-page", () => {
  it("replaces an existing task in place without changing total", () => {
    const first = samplePage.data[0]
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const updated: Task = { ...first, title: "Updated First" }
    const result = reconcileTaskInPage(samplePage, updated, { page: 1, pageSize: 2 }, "update")
    expect(result.page?.data[0]?.title).toBe("Updated First")
    expect(result.page?.data[1]?.title).toBe("Second")
    expect(result.page?.pagination.total).toBe(2)
    expect(result.requiresRefetch).toBe(false)
  })

  it("prepends an absent task on page 1 and trims to pageSize", () => {
    const newTask: Task = {
      id: "task-3",
      title: "Third",
      status: "done",
      priority: "low",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }
    const result = reconcileTaskInPage(samplePage, newTask, { page: 1, pageSize: 2 }, "create")
    expect(result.page?.data.length).toBe(2)
    expect(result.page?.data[0]?.id).toBe("task-3")
    expect(result.page?.data[1]?.id).toBe("task-1")
    expect(result.page?.pagination.total).toBe(3)
    expect(result.page?.pagination.totalPages).toBe(2)
    expect(result.requiresRefetch).toBe(false)
  })

  it("leaves filtered pages to the server evaluator", () => {
    const newTask: Task = {
      id: "task-3",
      title: "Third",
      status: "todo",
      priority: "low",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }
    const result = reconcileTaskInPage(
      samplePage,
      newTask,
      {
        page: 1,
        pageSize: 2,
        filters: [{ field: "status", op: "eq", value: "done" }],
      },
      "create",
    )
    expect(result.page).toBe(samplePage)
    expect(result.requiresRefetch).toBe(true)
  })

  it("leaves page unchanged when absent task is inserted on page > 1", () => {
    const newTask: Task = {
      id: "task-3",
      title: "Third",
      status: "todo",
      priority: "low",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }
    const page2: PaginatedResult<Task> = {
      ...samplePage,
      pagination: { page: 2, pageSize: 2, total: 4, totalPages: 2 },
    }
    const result = reconcileTaskInPage(page2, newTask, { page: 2, pageSize: 2 }, "create")
    expect(result.page).toBe(page2)
    expect(result.requiresRefetch).toBe(true)
  })

  it("updates a row immediately and requests refetch when its sort position changes", () => {
    const first = samplePage.data[0]
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const result = reconcileTaskInPage(
      samplePage,
      { ...first, priority: "high" },
      { page: 1, pageSize: 2, sortBy: "priority", order: "desc" },
      "update",
    )
    expect(result.page?.data[0]?.priority).toBe("high")
    expect(result.requiresRefetch).toBe(true)
  })

  it("preserves a filtered page and requests server reconciliation after an update", () => {
    const first = samplePage.data[0]
    expect(first).toBeDefined()
    if (first === undefined) {
      return
    }
    const result = reconcileTaskInPage(
      samplePage,
      { ...first, status: "done" },
      {
        page: 1,
        pageSize: 2,
        filters: [{ field: "status", op: "eq", value: "todo" }],
      },
      "update",
    )
    expect(result.page).toBe(samplePage)
    expect(result.requiresRefetch).toBe(true)
  })

  it("inserts an absent task into its domain-ranked position on a sorted first page", () => {
    const newTask: Task = {
      id: "task-3",
      title: "Third",
      status: "todo",
      priority: "high",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }
    const result = reconcileTaskInPage(
      samplePage,
      newTask,
      {
        page: 1,
        pageSize: 2,
        sortBy: "priority",
        order: "desc",
      },
      "create",
    )
    expect(result.page?.data.map((task) => task.id)).toEqual(["task-3", "task-2"])
    expect(result.page?.pagination.total).toBe(3)
    expect(result.requiresRefetch).toBe(false)
  })

  it("preserves an unknown upsert and refetches instead of changing totals", () => {
    const task: Task = {
      id: "live-1",
      title: "Unknown streamed row",
      status: "todo",
      priority: "high",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }
    const result = reconcileTaskInPage(samplePage, task, { page: 1, pageSize: 2 }, "upsert")
    expect(result.page).toBe(samplePage)
    expect(result.page?.pagination).toEqual(samplePage.pagination)
    expect(result.requiresRefetch).toBe(true)
  })

  it("requires a fetch without evicting when no page is cached", () => {
    const task = samplePage.data[0]
    expect(task).toBeDefined()
    if (task === undefined) return
    expect(reconcileTaskInPage(undefined, task, {}, "upsert")).toEqual({
      page: undefined,
      requiresRefetch: true,
    })
  })

  it("drops a task from page and decrements total", () => {
    const res = dropTaskFromPage(samplePage, "task-1")
    expect(res?.data.length).toBe(1)
    expect(res?.data[0]?.id).toBe("task-2")
    expect(res?.pagination.total).toBe(1)
  })

  it("returns original page if task to drop is not present", () => {
    const res = dropTaskFromPage(samplePage, "non-existent")
    expect(res).toBe(samplePage)
  })
})
