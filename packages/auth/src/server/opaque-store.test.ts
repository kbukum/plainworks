import { guardSchema } from "@plainworks/std/seam"
import { expect, test } from "vitest"
import { createMemorySessionStore } from "./opaque-store"

// Contract behavior runs from `../testing` conformance cases; this covers memory-only config.
test("memory store rejects non-positive capacities", () => {
  const schema = guardSchema((value): value is string => typeof value === "string")
  expect(() => createMemorySessionStore({ schema, capacity: 0 })).toThrow()
  expect(() => createMemorySessionStore({ schema, transactionCapacity: 1.5 })).toThrow()
})
