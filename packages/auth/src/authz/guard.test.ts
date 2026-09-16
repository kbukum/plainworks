import type { Decision } from "@plainworks/std"
import { describe, expect, test } from "vitest"
import { guardDecision } from "./guard"

const allow: Decision = { allow: true }
const deny: Decision = { allow: false, reason: "forbidden" }

describe("guardDecision", () => {
  test("permits the route when the decision allows", () => {
    expect(guardDecision(allow)).toEqual({ allow: true })
  })

  test("forbids the route when the decision denies, carrying its reason", () => {
    expect(guardDecision(deny)).toEqual({ allow: false, reason: "forbidden" })
  })

  test("attaches a sanitized same-origin redirect to the forbidden route when configured", () => {
    expect(guardDecision(deny, { forbiddenPath: "/forbidden" })).toEqual({
      allow: false,
      reason: "forbidden",
      redirect: { to: "/forbidden", reason: "forbidden" },
    })
  })

  test("collapses an off-origin forbidden path to the safe fallback", () => {
    const outcome = guardDecision(deny, { forbiddenPath: "https://evil.test" })
    expect(outcome).toEqual({
      allow: false,
      reason: "forbidden",
      redirect: { to: "/", reason: "forbidden" },
    })
  })

  test("does not redirect an allowed decision even when a forbidden path is configured", () => {
    expect(guardDecision(allow, { forbiddenPath: "/forbidden" })).toEqual({ allow: true })
  })
})
