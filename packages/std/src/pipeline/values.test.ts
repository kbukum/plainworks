import { expect, test } from "vitest"
import { pipeValues } from "./values"

test("pipeValues threads a value left to right", () => {
  expect(
    pipeValues(
      2,
      (n) => n + 3,
      (n) => n * 2,
    ),
  ).toBe(10)
  expect(pipeValues("x")).toBe("x")
})
