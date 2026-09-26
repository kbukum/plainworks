import { describe, expect, it } from "vitest"
import { ACCOUNT_PATH, OVERVIEW_PATH, TASKS_PATH } from "./constants"
import { HOST_NAVIGATION, hostRouteFor } from "./routes"

describe("host routes", () => {
  it("resolves each known path to its page title and summary", () => {
    expect(hostRouteFor(OVERVIEW_PATH)?.label).toBe("Overview")
    expect(hostRouteFor(TASKS_PATH)?.label).toBe("Tasks")
    expect(hostRouteFor(ACCOUNT_PATH)?.label).toBe("Account settings")
    for (const path of [OVERVIEW_PATH, TASKS_PATH, ACCOUNT_PATH]) {
      expect(hostRouteFor(path)?.summary.length).toBeGreaterThan(0)
    }
  })

  it("ignores a trailing slash and returns nothing for an unknown path", () => {
    expect(hostRouteFor(`${TASKS_PATH}/`)?.id).toBe("tasks")
    expect(hostRouteFor("/nowhere")).toBeUndefined()
  })

  it("lists the primary sections in navigation order", () => {
    expect(HOST_NAVIGATION.map((route) => route.path)).toEqual([OVERVIEW_PATH, TASKS_PATH])
  })
})
