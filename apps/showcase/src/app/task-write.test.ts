import { createHttpClient } from "@plainworks/http"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createTask, updateTask } from "./task-write"

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe("task-write", () => {
  const client = createHttpClient({ baseUrl: "http://test.local" })

  it("creates a task and validates the response envelope", async () => {
    server.use(
      http.post("http://test.local/api/tasks", async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          data: {
            id: "task-1",
            title: body.title,
            status: "todo",
            priority: "medium",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        })
      }),
    )

    const created = await createTask(client, { title: "New Task" })
    expect(created.id).toBe("task-1")
    expect(created.title).toBe("New Task")
  })

  it("updates a task with encoded id segment", async () => {
    let requestedPath = ""
    server.use(
      http.patch("http://test.local/api/tasks/:id", async ({ params }) => {
        requestedPath = String(params.id)
        return HttpResponse.json({
          data: {
            id: requestedPath,
            title: "Updated",
            status: "done",
            priority: "high",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
          },
        })
      }),
    )

    const updated = await updateTask(client, "task 1# special", { title: "Updated" })
    expect(requestedPath).toBe("task 1# special")
    expect(updated.title).toBe("Updated")
  })

  it("rejects dangerous or dot-segment ids", async () => {
    await expect(updateTask(client, ".", { title: "x" })).rejects.toThrow("Invalid task id")
    await expect(updateTask(client, "..", { title: "x" })).rejects.toThrow("Invalid task id")
    await expect(updateTask(client, "../settings", { title: "x" })).rejects.toThrow(
      "Invalid task id",
    )
    await expect(updateTask(client, "foo/bar", { title: "x" })).rejects.toThrow("Invalid task id")
    await expect(updateTask(client, "  ", { title: "x" })).rejects.toThrow("Invalid task id")
  })
})
