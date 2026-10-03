import { expect, test } from "vitest"
import { decodeProblem } from "./problem"

test.each([
  { status: 401, code: "UNAUTHORIZED", retryable: false, authentication: "unauthenticated" },
  { status: 503, code: "SERVICE_UNAVAILABLE", retryable: true, authentication: undefined },
])("omitted problem type preserves HTTP $status classification", (expected) => {
  const problem = { title: "Request failed", status: expected.status }
  expect(decodeProblem(problem, expected.status)).toMatchObject({
    kind: "http/status",
    ...expected,
  })
  expect(decodeProblem(problem, expected.status)).toEqual(
    decodeProblem({ ...problem, type: "about:blank" }, expected.status),
  )
})

test.each([null, 42, {}])("invalid problem type remains operational: %j", (type) => {
  expect(decodeProblem({ type, status: 401 }, 401)).toMatchObject({
    kind: "http/decode",
    code: "EXTERNAL_SERVICE_ERROR",
    status: undefined,
    retryable: false,
  })
})
