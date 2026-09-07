import { describe, expect, test } from "vitest"
import { isTerminalStatus } from "./status"

describe("isTerminalStatus", () => {
  test("only closed is terminal", () => {
    expect(isTerminalStatus("closed")).toBe(true)
    for (const status of ["idle", "connecting", "open", "reconnecting", "closing"] as const) {
      expect(isTerminalStatus(status)).toBe(false)
    }
  })
})
