import { decodeProblem } from "@plainworks/std/failure"
import { expect, test } from "vitest"
import { problemFrame, problemJson } from "./problem"

test("builds a problem the standard decoder reads", () => {
  const body = problemJson(409, {
    type: "https://example.test/conflict",
    detail: "Taken.",
    extensions: { status: 500, resource: "user" },
  })
  expect(body).toEqual({
    type: "https://example.test/conflict",
    status: 409,
    detail: "Taken.",
    resource: "user",
  })
  expect(decodeProblem({ status: 409, body })).toMatchObject({
    code: "aborted",
    reason: "https://example.test/conflict",
    metadata: { resource: "user" },
  })
})

test("frames the problem as an SSE failure event", () => {
  expect(problemFrame(401)).toBe('event: failure\ndata: {"type":"about:blank","status":401}\n\n')
})

test.each([200, 302, 600, 4.5])("refuses non-error status %s", (status) => {
  expect(() => problemJson(status)).toThrow(RangeError)
})
